# syntax=docker/dockerfile:1.7
# The render worker image (SPEC 11 Hosting; MILESTONES M2 item 6): Node 24, Chrome for Testing 147
# (the Playwright chromium-1217 build the deck's shoot-slide.mjs hard-codes, AGENTS.md "Chromium"),
# LibreOffice and poppler for the verify loop (SPEC 8.5), the export font set installed system wide
# so LibreOffice renders with the same faces the PPTX embeds (SPEC 8.4), and the repository built
# inside. The default command is the job queue; any `turboslide` command runs in the same image:
#
#   docker build -f docker/render-worker.Dockerfile -t turboslide-render-worker .
#   docker run --rm turboslide-render-worker fc-list | grep -c "GT Inter"   (30 faces)
#   docker run --rm -v "$PWD:/work" turboslide-render-worker turboslide export pptx \
#     --deck /work/decks/gt-brand --mode flatten --theme light,dark --fonts exact --verify \
#     --out /work/.turboslide/export
#   docker run --rm -p 4322:4322 -v "$PWD:/work" turboslide-render-worker
#
# The build context is the sources: ../.dockerignore (the classic builder) and
# render-worker.Dockerfile.dockerignore (BuildKit) hold one list and leave out node_modules, the
# crate's target and docs/, which nothing in the image reads. Check step 25 rebuilds this image, and
# a rebuild leaves the superseded image untagged in the daemon's store; `docker image prune`
# reclaims it.
#
# LibreOffice: the milestone names 26.8. The Document Foundation ships Linux builds for x86_64
# only, and this image is built for the host's architecture (arm64 on Kevin's Mac), so the version
# is the newest in the base image's repositories, Debian 13 (trixie): 25.2 at build time. The exact
# string is recorded by `soffice --version` in every export report's residual and in
# docs/export-verification.md. Variable font support arrived in 26.8; the static export set is the
# safe path on 25.2 as well (pptx report section 3).
#
# Chrome runs as root inside the container, so Playwright adds --no-sandbox (its default when
# chromiumSandbox is not requested) and --disable-dev-shm-usage; the headless package selects the
# SwiftShader flags on Linux (TURBOSLIDE_GPU=swiftshader).

FROM node:24-trixie AS runtime

ARG CHROMIUM_REVISION=1217
ARG PNPM_VERSION=11.15.1
# CI builds keep the frozen lockfile; a local build during a milestone whose lockfile is not yet
# committed passes --build-arg PNPM_INSTALL_FLAGS=--no-frozen-lockfile (the image's copy only).
ARG PNPM_INSTALL_FLAGS=--frozen-lockfile

ENV DEBIAN_FRONTEND=noninteractive \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# LibreOffice (Impress and the core it needs), poppler for pdftoppm and pdfinfo, fontconfig,
# fallback faces so a missing glyph never becomes a tofu box in a verify render, and the shared
# libraries Chrome for Testing loads (the list `playwright-core install-deps chromium` resolves on
# Debian 13; installing them here keeps them in the cached apt layer).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libreoffice-impress \
        libreoffice-draw \
        poppler-utils \
        fontconfig \
        fonts-liberation \
        fonts-dejavu-core \
        fonts-noto-core \
        ca-certificates \
        curl \
        unzip \
        libasound2t64 \
        libatk-bridge2.0-0t64 \
        libatk1.0-0t64 \
        libatspi2.0-0t64 \
        libcups2t64 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxi6 \
        libxkbcommon0 \
        libxrandr2 \
        libxshmfence1 \
    && rm -rf /var/lib/apt/lists/* \
    && soffice --version \
    && pdftoppm -v 2>&1 | head -1

# Chrome for Testing 147.0.7727.15: Playwright's chromium build 1217 for this architecture. The
# architecture comes from dpkg, not from BuildKit's TARGETARCH, so the classic builder works too.
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "${arch}" in \
      arm64) zip="chromium-linux-arm64.zip" ;; \
      amd64) zip="chromium-linux.zip" ;; \
      *) echo "unsupported architecture ${arch}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/chromium/${CHROMIUM_REVISION}/${zip}" -o /tmp/chromium.zip; \
    mkdir -p "/ms-playwright/chromium-${CHROMIUM_REVISION}"; \
    unzip -q /tmp/chromium.zip -d "/ms-playwright/chromium-${CHROMIUM_REVISION}"; \
    rm /tmp/chromium.zip; \
    "/ms-playwright/chromium-${CHROMIUM_REVISION}/chrome-linux/chrome" --version

ENV TURBOSLIDE_CHROME=/ms-playwright/chromium-1217/chrome-linux/chrome \
    TURBOSLIDE_GPU=swiftshader

RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate

WORKDIR /app

# The workspace: install with the committed lockfile, then Chrome's shared libraries through
# Playwright's own dependency list for this Debian release.
COPY . .
RUN pnpm install ${PNPM_INSTALL_FLAGS} \
    && pnpm exec playwright-core install-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# The export font set (packages/fonts/export, built by scripts/build-fonts.py and committed):
# installed system wide so LibreOffice resolves the GT Inter families the PPTX names. Round two
# of the Google Slides parity (gslides-parity SPEC-2 7.1) added an italic twin of every face: 34
# files, 30 of them named GT Inter (the four Inter and Inter Medium cuts are the rest).
RUN mkdir -p /usr/local/share/fonts/turboslide \
    && cp packages/fonts/export/*.ttf /usr/local/share/fonts/turboslide/ \
    && fc-cache -f \
    && test "$(fc-list | grep -c 'GT Inter')" -ge 30

# The CLI on PATH; the repo's own launcher runs the TypeScript source through Node's type stripping.
RUN ln -s /app/apps/cli/bin/turboslide.mjs /usr/local/bin/turboslide \
    && turboslide --help > /dev/null \
    && node --input-type=module -e "await import('/app/apps/render-worker/src/server.ts'); console.log('render-worker imports resolve')"

ENV TURBOSLIDE_ROOT=/app \
    TURBOSLIDE_WORKER_HOST=0.0.0.0 \
    TURBOSLIDE_WORKER_PORT=4322 \
    TURBOSLIDE_WORKER_DIR=/work/.turboslide/worker \
    NODE_ENV=production

VOLUME ["/work"]
EXPOSE 4322

CMD ["node", "apps/render-worker/src/main.ts"]
