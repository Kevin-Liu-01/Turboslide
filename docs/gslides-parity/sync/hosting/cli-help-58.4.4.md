# The Vercel CLI help the runbook was checked against

Vercel CLI 58.4.4 on Node.js 24.13.0, read 2026-09-21 (read only). A top level command prints its options with `vercel <command> --help`; a subcommand prints its own with `vercel <command> --help <subcommand>` (`vercel env pull --help` prints an error in this version) and a third level with `vercel <command> --help <sub> <subsub>`. The global options every command shares (`--cwd`, `--debug`, `--global-config`, `--help`, `--local-config`, `--no-color`, `--non-interactive`, `--scope`, `--token`, `--version`) are left out of every block; `-S, --scope <slug>` is the one the runbook uses. `RUNBOOK.md` section 7 maps every flag it names to a block here. Blocks: 36.

## vercel blob create-store

```
  ▲ vercel blob create-store [name] [options]
  Create a new Blob store
  Options:
  -a,  --access <String>    Access level for the blob: public or private
                            (required)
  -e,  --environment <ENV>  Environment to connect (can be repeated: production,
                            preview, development). Defaults to all when --yes is
                            used.
  -r,  --region <STRING>    Region to create the Blob store in (default:
                            "iad1"). See
                            https://vercel.com/docs/edge-network/regions#region…
                            for all available regions
  -y,  --yes                Accept default value for all prompts
  Examples:
  - Create a blob store (uses default region "iad1")
    $ vercel blob create-store my-store --access private
  - Create a blob store in a specific region
    $ vercel blob create-store my-store --access private --region cdg1
  - Create and connect to project in CI
    $ vercel blob create-store my-store --access private --yes --environment production --environment preview
```

## vercel blob del

```
  ▲ vercel blob del urlsOrPathnames [options]
  Delete a file from the Blob store
  Options:
   --if-match <STRING>  Only perform the operation if the blob's ETag matches
                        this value
```

## vercel blob delete-store

```
  ▲ vercel blob delete-store [storeId] [options]
  Delete a Blob store
  Options:
  -y,  --yes  Accept default value for all prompts
```

## vercel blob get

```
  ▲ vercel blob get urlOrPathname [options]
  Download a blob by URL or pathname
  Options:
  -a,  --access <String>         Access level for the blob: public or private
                                 (required)
       --if-none-match <STRING>  Only return content if the blob's ETag does not
                                 match this value (returns 304 if unchanged)
  -o,  --output <PATH>           Save blob content to a file instead of stdout
```

## vercel blob get-store

```
  ▲ vercel blob get-store [storeId]
  Get a Blob store
```

## vercel blob list

```
  ▲ vercel blob list [options]
  List all files in the Blob store
  Options:
  -c,  --cursor <STRING>  Cursor from previous page to start listing from
  -l,  --limit <NUMBER>   Number of results to return per page (default: 10,
                          max: 1000)
  -m,  --mode <String>    Mode to filter Blobs by either folded or expanded
                          (default: expanded)
  -p,  --prefix <STRING>  Prefix to filter Blobs by
```

## vercel blob list-stores

```
  ▲ vercel blob list-stores [options]
  List all Blob stores
  Options:
  -a,  --all          List all blob stores for the team, not just the ones connected
                      to the current project
       --json         Output results as JSON
       --no-projects  Hide the Projects column (table output only)
  Examples:
  - List blob stores for the linked project
    $ vercel blob list-stores
  - List all team blob stores as JSON
    $ vercel blob list-stores --all --json
```

## vercel blob put

```
  ▲ vercel blob put pathToFile [options]
  Upload a file to the Blob store
  Options:
  -a,  --access <String>                 Access level for the blob: public or
                                         private (required)
  -r,  --add-random-suffix <Boolean>     Add a random suffix to the file name
                                         (default: false)
       --allow-overwrite <Boolean>       Overwrite the file if it already exists
                                         (default: false)
  -c,  --cache-control-max-age <Number>  Max-age of the cache-control header
                                         directive (default: 2592000 = 30 days)
  -t,  --content-type <String>           Overwrite the content-type. Will be
                                         inferred from the file extension if not
                                         provided
       --if-match <STRING>               Only perform the operation if the
                                         blob's ETag matches this value
  -u,  --multipart <Boolean>             If true upload the file in multiple
                                         small chunks for performance and
                                         reliability (default: true)
  -p,  --pathname <String>               Pathname to upload the file to
                                         (default: filename)
```

## vercel deploy

```
  ▲ vercel deploy [project-path] [options]
  Deploy your project to Vercel. The `deploy` command is the default command
  for the Vercel CLI, and can be omitted (`vc deploy my-app` equals `vc
  my-app`). Use `--dry` to inspect the detected framework preset and source
  files without deploying.
  Options:
       --archive <FORMAT>       Compress the deployment code into an archive
                                before uploading it
  -b,  --build-env <KEY=VALUE>  Specify environment variables during build-time
                                (e.g. `-b KEY1=value1 -b KEY2=value2`)
       --dry                    Inspect the detected framework preset and source
                                files without uploading or creating a
                                deployment. Non-TTY output includes every file
                                as JSON
  -e,  --env <KEY=VALUE>        Specify environment variables during run-time
                                (e.g. `-e KEY1=value1 -e KEY2=value2`)
  -f,  --force                  Force a new deployment even if nothing has
                                changed
  -F,  --format <FORMAT>        Specify the output format (json)
       --guidance               Receive command suggestions once deployment is
                                complete
       --json                   Output as JSON
  -l,  --logs                   Print the build logs
  -m,  --meta <KEY=VALUE>       Specify metadata for the deployment (e.g. `-m
                                KEY1=value1 -m KEY2=value2`)
       --no-wait                Don't wait for the deployment to finish
       --prebuilt               Use in combination with `vc build`. Deploy an
                                existing build
       --prod                   Create a production deployment (shorthand for
                                `--target=production`)
       --project <NAME_OR_ID>   Project name or ID (defaults to the linked
                                project)
       --regions <REGION>       Set default regions to enable the deployment on
       --skip-domain            Disable the automatic promotion (aliasing) of
                                the relevant domains to a new production
                                deployment. You can use `vc promote` to complete
                                the domain-assignment process later
       --target <TARGET>        Specify the target deployment environment
       --with-cache             Retain build cache when using "--force"
  -y,  --yes                    Use default options to skip all prompts
  Examples:
  - Deploy the current directory
    $ vercel
  - Deploy a custom path
    $ vercel /usr/src/project
  - Deploy with run-time Environment Variables
    $ vercel -e NODE_ENV=production
  - Deploy with prebuilt outputs
    $ vercel build
    $ vercel deploy --prebuilt
  - Inspect deployment inputs without deploying
    $ vercel deploy --dry
  - Get every deployment file as JSON
    $ vercel deploy --dry --json
  - Write Deployment URL to a file
    $ vercel > deployment-url.txt
```

## vercel env add

```
  ▲ vercel env add name [environment] [git-branch] [options]
  Add an Environment Variable
  Options:
       --force                    Overwrite an existing variable for the same target
       --guidance                 Show command suggestions after completion
       --no-sensitive             Store the value as non-sensitive when policy allows
       --project <NAME_OR_ID>     Project name or ID (defaults to the linked project)
       --sensitive                Store the value as sensitive for Production or
                                  Preview
       --value <VALUE>            Set the variable value for non-interactive use;
                                  otherwise use stdin or the prompt
       --visibility <VISIBILITY>  Set config/secret visibility (`config` or
                                  `secret`). Inferred from type when omitted and
                                  VERCEL_ENV_VAR_CONFIG_SECRET_UI is set
  -y,  --yes                      Skip the confirmation prompt when adding an
                                  Environment Variable
  Examples:
  - Add a new variable (prompts for value and Environments)
    $ vercel env add <name>
    $ vercel env add API_TOKEN
  - Add a new Environment Variable to a specific Environment
    $ vercel env add <name> <production | preview | development>
    $ vercel env add DB_PASS production
  - Add one variable to multiple Environments (comma-separated)
    $ vercel env add <name> <environment>[,<environment>]
    $ vercel env add API_URL production,preview,development
  - Override an existing Environment Variable of same target (production, preview, deployment)
    $ vercel env add API_TOKEN --force
  - Add a regular (non-sensitive) Environment Variable that remains readable later
    $ vercel env add API_TOKEN --no-sensitive
  - Add a new Environment Variable for a specific Environment and Git Branch
    $ vercel env add <name> <production | preview | development> <gitbranch>
    $ vercel env add DB_PASS preview feat1
  - Add a new Environment Variable from stdin
    $ cat <file> | vercel env add <name> <production | preview | development>
    $ cat ~/.npmrc | vercel env add NPM_RC preview
    $ vercel env add API_URL production < url.txt
  - Add with --value for non-interactive use
    $ vercel env add API_TOKEN production --value "<value>" --yes
```

## vercel env list

```
  ▲ vercel env list [environment] [git-branch] [options]
  List all Environment Variables for a Project
  Options:
  -F,  --format <FORMAT>       Specify the output format (json)
       --guidance              Receive command suggestions once command is complete
       --json                  Output as JSON
       --project <NAME_OR_ID>  Project name or ID (defaults to the linked project)
```

## vercel env pull

```
  ▲ vercel env pull [filename] [options]
  Pull all Development Environment Variables from the cloud and write to a file
  [.env.local]
  Options:
       --environment <TARGET>  Set the Environment when pulling Environment Variables
       --git-branch <NAME>     Specify the Git branch to pull specific Environment
                               Variables for
       --id <ID>               Pull environment variables for a specific deployment
                               (e.g. dpl_xxx)
       --project <NAME_OR_ID>  Project name or ID (defaults to the linked project)
  -y,  --yes                   Skip the confirmation prompt when removing an
                               environment variable
  Examples:
  - Pull all Development Environment Variables down from the cloud
    $ vercel env pull <file>
    $ vercel env pull .env.development.local
  - Pull environment variables for a specific deployment
    $ vercel env pull --id dpl_xxx
```

## vercel env remove

```
  ▲ vercel env remove name [environment] [options]
  Remove an Environment Variable (see examples below)
  Options:
       --project <NAME_OR_ID>  Project name or ID (defaults to the linked project)
  -y,  --yes                   Skip the confirmation prompt when removing an
                               Environment Variable
  Examples:
  - Remove a variable from multiple Environments
    $ vercel env rm <name>
    $ vercel env rm API_TOKEN
  - Remove a variable from a specific Environment
    $ vercel env rm <name> <production | preview | development>
    $ vercel env rm NPM_RC preview
  - Remove a variable from a specific Environment and Git Branch
    $ vercel env rm <name> <production | preview | development> <gitbranch>
    $ vercel env rm NPM_RC preview feat1
```

## vercel firewall discard

```
  ▲ vercel firewall discard [options]
  Permanently discard all unpublished draft changes, reverting to the current
  production configuration
  Options:
       --project <NAME_OR_ID>  Project name or ID (defaults to the linked project)
  -y,  --yes                   Accept default value for all prompts
  Examples:
  - Discard draft changes
    $ vercel firewall discard
  - Discard without confirmation
    $ vercel firewall discard --yes
```

## vercel firewall overview

```
  ▲ vercel firewall overview [options]
  Show a summary of your project's firewall configuration, including active
  rules, IP blocks, bypasses, and any unpublished draft changes
  Options:
   --json                  Output as JSON
   --project <NAME_OR_ID>  Project name or ID (defaults to the linked project)
  Examples:
  - Show firewall overview
    $ vercel firewall overview
```

## vercel firewall publish

```
  ▲ vercel firewall publish [options]
  Publish all draft firewall changes to production, making them live
  immediately
  Options:
       --project <NAME_OR_ID>  Project name or ID (defaults to the linked project)
  -y,  --yes                   Accept default value for all prompts
  Examples:
  - Publish draft changes
    $ vercel firewall publish
  - Publish without confirmation
    $ vercel firewall publish --yes
```

## vercel firewall rules

```
  ▲ vercel firewall rules command
  Manage custom firewall rules that control how traffic is handled based on
  conditions
  Commands:
  list                 List all custom firewall rules, including any
                       unpublished draft changes
  inspect  name-or-id  Show the full configuration of a custom firewall
                       rule, including conditions, action, and rate
                       limit settings
  add      [name]      Create a new custom firewall rule using AI, an
                       interactive builder, JSON, or command-line flags.
                       Stages a draft change — run `publish` to make it
                       live
  edit     name-or-id  Edit an existing custom firewall rule using AI,
                       an interactive editor, JSON, or command-line
                       flags. Stages a draft change — run `publish` to
                       make it live
  enable   name-or-id  Enable a disabled custom firewall rule. Stages a
                       draft change — run `publish` to make it live
  disable  name-or-id  Disable a custom firewall rule without removing
                       it. Stages a draft change — run `publish` to make
                       it live
  remove   name-or-id  Remove a custom firewall rule. Stages a draft
                       change — run `publish` to make it live
  reorder  name-or-id  Change the priority order of a custom firewall
                       rule. Stages a draft change — run `publish` to
                       make it live
  Examples:
  - List rules
    $ vercel firewall rules list
  - Inspect a rule
    $ vercel firewall rules inspect "Block bots"
  - Create with AI
    $ vercel firewall rules add --ai "Rate limit /api to 100 requests per minute by IP"
  - Edit with AI
    $ vercel firewall rules edit "My Rule" --ai "Change action to challenge"
```

## vercel firewall rules add

```
WARNING! Did you mean to deploy the subdirectory "firewall"? Use `vc --cwd firewall` instead.
  ▲ vercel firewall add [name] [options]
  Create a new custom firewall rule using AI, an interactive builder, JSON, or
  command-line flags. Stages a draft change — run `publish` to make it live
  Options:
       --action                Action: deny, challenge, log, bypass, rate_limit,
                               redirect
       --ai                    Generate rule from natural language (AI-powered)
       --condition             Condition as JSON (repeatable). Multiple conditions
                               are AND'd together. Fields: type (required), op
                               (required), value, key (for header/cookie/query), neg
                               (boolean). Example:
                               '{"type":"path","op":"pre","value":"/api"}'.
       --description           Rule description (max 256 chars)
       --disabled              Create as disabled (default: enabled)
       --duration              Action duration: 1m, 5m, 15m, 30m, 1h
       --json                  Create rule from JSON payload
       --or                    Start a new OR group. Conditions before --or are
                               AND'd, conditions after form a separate group.
                               Example: --condition A --condition B --or --condition
                               C matches (A AND B) OR C.
       --project <NAME_OR_ID>  Project name or ID (defaults to the linked project)
       --rate-limit-action     Action when rate limit is exceeded: log, deny,
                               challenge, rate_limit (default: rate_limit)
       --rate-limit-algo       Rate limit algorithm: fixed_window, token_bucket
                               (default: fixed_window)
       --rate-limit-keys       Rate limit keys (repeatable): ip, ja4, header:name
                               (default: ip)
       --rate-limit-requests   Rate limit max requests per window, 1-10000000
                               (required for rate_limit)
       --rate-limit-window     Rate limit window in seconds, 10-3600 (required for
                               rate_limit)
       --redirect-permanent    Permanent redirect (301). Default: temporary (307)
       --redirect-url          Redirect URL or path
  -y,  --yes                   Accept default value for all prompts
  Examples:
  - Interactive mode
    $ vercel firewall rules add
  - Create with AI
    $ vercel firewall rules add --ai "Rate limit /api to 100 requests per minute by IP"
  - Create from JSON
    $ vercel firewall rules add --json '{"name":"Block bots","active":true,"conditionGroup":[{"conditions":[{"type":"user_agent","op":"sub","value":"crawler"}]}],"action":{"mitigate":{"action":"deny"}}}'
  - Create with flags
    $ vercel firewall rules add "Block bots" --condition '{"type":"user_agent","op":"sub","value":"crawler"}' --action deny --yes
  - Create with OR groups
    $ vercel firewall rules add "Block suspicious" --condition '{"type":"user_agent","op":"sub","value":"crawler"}' --or --condition '{"type":"ip_address","op":"eq","value":"1.2.3.4"}' --action deny --yes
```

## vercel git connect

```
  ▲ vercel git command
  Manage your Git repository connection to the current Project
  Commands:
  connect     [git-url]  Connect your Vercel Project to your Git repository
                         or provide the remote URL to your Git repository
  disconnect             Disconnect the Git repository from your Vercel
                         Project
```

## vercel git disconnect

```
  ▲ vercel git command
  Manage your Git repository connection to the current Project
  Commands:
  connect     [git-url]  Connect your Vercel Project to your Git repository
                         or provide the remote URL to your Git repository
  disconnect             Disconnect the Git repository from your Vercel
                         Project
```

## vercel inspect

```
  ▲ vercel inspect url|deploymentId [options]
  Show information about a deployment.
  Options:
  -F,  --format <FORMAT>  Specify the output format (json)
       --json             Output as JSON
  -l,  --logs             Prints the build logs instead of the deployment
                          summary
       --timeout <TIME>   Time to wait for deployment completion [3m]
       --wait             Blocks until deployment completes
  Examples:
  - Get information about a deployment by its unique URL
    $ vercel inspect my-deployment-ji2fjij2.vercel.app
  - Get information about the deployment an alias points to
    $ vercel inspect my-deployment.vercel.app
  - Get information about a deployment by piping in the URL
    $ echo my-deployment.vercel.app | vercel inspect
  - Wait up to 90 seconds for deployment to complete
    $ vercel inspect my-deployment.vercel.app --wait --timeout 90s
  - Get deployment build logs
    $ vercel inspect my-deployment.vercel.app --logs
  - Get deployment information as JSON
    $ vercel inspect my-deployment.vercel.app --json
```

## vercel link

```
  ▲ vercel link command [options]
  Link a local directory to a Vercel project
  Commands:
  add    Add projects to an existing repository link created by link
         --repo
  Options:
  -p,  --project <NAME_OR_ID>    Set the project name or ID to link; required for
                                 non-interactive existing-project links
  -r,  --repo                    Link multiple projects from the Git repository
                                 (alpha)
       --team <TEAM_ID_OR_SLUG>  Set the team ID or slug; use with --project for
                                 non-interactive links
  -y,  --yes                     Skip questions when setting up with default team
                                 and settings
  Examples:
  - Link current directory to a Vercel project
    $ vercel link
  - Link current directory with default options and skip questions
    $ vercel link --yes
  - Link to an existing project in CI or agent mode
    $ vercel link --yes --team <team-id> --project <project-name-or-id>
  - Link a specific directory to a Vercel project
    $ vercel link --cwd /path/to/project
  - Link multiple projects from the current Git repository
    $ vercel link --repo
  - Add additional projects to an existing repository link
    $ vercel link add
```

## vercel list

```
  ▲ vercel list [app] [options]
  List deployments.
  Options:
  -a,  --all                   List resources across all projects
       --environment <TARGET>
  -F,  --format <FORMAT>       Specify the output format (json)
       --json                  Output as JSON
       --limit <NUMBER>        Number of results to return per page (default: 20,
                               max: 100)
  -m,  --meta <KEY=VALUE>      Filter deployments by metadata (e.g.: `-m
                               KEY=value`). Can appear many times.
  -N,  --next <MS>             Show next page of results
  -p,  --policy <KEY=VALUE>    See deployments with provided Deployment Retention
                               policies (e.g.: `-p KEY=value`). Can appear many
                               times.
  -s,  --status <STATUS>       Filter deployments by their status. Can be
                               comma-separated for multiple statuses (e.g.:
                               `--status BUILDING,READY`)
  -y,  --yes                   Accept default value for all prompts
  Examples:
  - List all deployments for the currently linked project
    $ vercel list
  - List all deployments across all projects
    $ vercel list --all
  - List all deployments for the project `my-app`
    $ vercel list my-app
  - Filter deployments by metadata
    $ vercel list -m key1=value1 -m key2=value2
  - Paginate deployments for a project, where `1584722256178` is the time in milliseconds since the UNIX epoch
    $ vercel list my-app --next 1584722256178
  - Filter deployments by status
    $ vercel list --status READY
  - Filter deployments by multiple statuses
    $ vercel list --status BUILDING,ERROR
```

## vercel logs

```
  ▲ vercel logs [url|deploymentId] [options]
  Display request logs for a project.
  With --follow, stream live runtime logs from a deployment. When no deployment
  is specified, resolves in order: latest deployment on the current git branch,
  then your latest deployment, then the latest production deployment. Use
  --environment production to always stream the latest production deployment.
  Source types: λ = serverless, ε = edge/middleware, ◇ = static/external
  Options:
  -b,  --branch                Filter by git branch (defaults to current branch
                               for a linked project)
  -d,  --deployment            Filter logs to a specific deployment ID or URL
                               (alternative to positional argument)
       --environment           Filter by environment: production or preview.
                               With --follow, selects which environment to
                               stream (production always streams the latest
                               production deployment)
  -x,  --expand                Show full log message below each request line
                               (default when output is not a TTY)
  -f,  --follow                Stream live runtime logs. Without a deployment,
                               follows the latest deployment on the current git
                               branch, then your latest deployment, then the
                               latest production deployment
  -j,  --json                  Output logs as JSON Lines for piping to other
                               tools
       --level                 Filter by log level: error, warning, info, fatal
  -n,  --limit                 Maximum number of results (default: 100)
       --no-branch             Disable auto-detection of git branch
       --no-follow             No-op; deployment arguments only stream logs when
                               --follow is set
  -p,  --project <NAME_OR_ID>  Project name or ID (defaults to the linked
                               project)
  -q,  --query                 Advanced search query (supports filter syntax,
                               e.g. "status:500 error")
       --request-id            Filter by request ID
       --since                 Start time (ISO format or relative: 1h, 30m)
       --source                Filter by source: serverless, edge-function,
                               edge-middleware, static
       --status-code           Filter by HTTP status code (e.g., 500, 4xx)
       --until                 End time (ISO format or relative, default: now)
  Examples:
  - Stream live logs for your most recent deployment
    $ vercel logs --follow
  - Stream live logs for the latest production deployment
    $ vercel logs --follow --environment production
  - Stream live logs for a deployment URL
    $ vercel logs https://my-app-xxxxx.vercel.app --follow
  - Stream live logs for a deployment ID
    $ vercel logs dpl_xxxxx --follow
  - Stream logs for a specific project
    $ vercel logs --project my-app --follow
  - Display recent logs for the linked project
    $ vercel logs
  - Display error logs from the last hour
    $ vercel logs --level error --since 1h
  - Display logs for a specific deployment (historical)
    $ vercel logs dpl_xxxxx
  - Filter logs by status code and output as JSON
    $ vercel logs --status-code 500 --json
  - Search logs and pipe to jq
    $ vercel logs --query "timeout" --json | jq '.message'
  - Use advanced search query with filters
    $ vercel logs --query 'status:500 error' --json | jq '.message'
  - Display production logs only
    $ vercel logs --environment production
  - Display logs for a specific request
    $ vercel logs --request-id req_xxxxx
  - Display logs with full message details
    $ vercel logs --expand
  - Display logs for a specific branch
    $ vercel logs --branch feature-x
  - Display logs for all branches (disable auto-detection)
    $ vercel logs --no-branch
```

## vercel project add

```
  ▲ vercel project add name
  Add a new project
  Examples:
  - Add a new project
    $ vercel project add my-project
```

## vercel project inspect

```
  ▲ vercel project inspect [name] [options]
  Displays information related to a project
  Options:
  -y,  --yes  Accept default value for all prompts
  Examples:
  - Inspect the linked project from the current directory
    $ vercel project inspect
  - Inspect the project named "my-project"
    $ vercel project inspect my-project
```

## vercel project protection

```
  ▲ vercel project protection [action] [name] [options]
  Show or toggle deployment protection settings for a project
  Options:
       --customer-support-code-visibility   Apply action to customer support code
                                            visibility protection.
  -F,  --format <FORMAT>                    Specify the output format (json)
       --git-fork-protection                Apply action to Git fork protection.
       --json                               Output as JSON
       --password                           Apply action to password protection
                                            (requires eligible plan/permissions).
       --protection-bypass                  Apply action to automation protection
                                            bypass secrets.
       --protection-bypass-secret <SECRET>  Optional secret value for protection
                                            bypass. Required when disabling bypass.
       --protection-password <PASSWORD>     Password value when enabling password
                                            protection (max 72 characters). Requires
                                            --password.
       --skew                               Apply action to skew protection.
       --skew-max-age <SECONDS>             When enabling with --skew, max age in
                                            seconds for skew protection (default
                                            2592000, 30 days).
       --sso                                Apply action to SSO protection.
  Examples:
  - Protection settings for the linked project
    $ vercel project protection
  - Named project as JSON
    $ vercel project protection my-app --json
  - Disable password protection
    $ vercel project protection disable my-app --password
  - Enable password protection
    $ vercel project protection enable my-app --password
  - Enable password protection with a password
    $ vercel project protection enable my-app --password --protection-password <password>
  - Enable customer support code visibility
    $ vercel project protection enable my-app --customer-support-code-visibility
  - Disable customer support code visibility
    $ vercel project protection disable my-app --customer-support-code-visibility
  - Enable skew protection
    $ vercel project protection enable my-app --skew
  - Enable skew protection with custom max age (seconds)
    $ vercel project protection enable my-app --skew --skew-max-age 604800
  - Disable skew protection
    $ vercel project protection disable my-app --skew
  - Enable automation protection bypass
    $ vercel project protection enable my-app --protection-bypass
  - Disable bypass with secret
    $ vercel project protection disable my-app --protection-bypass --protection-bypass-secret <secret>
  - Enable Git fork protection
    $ vercel project protection enable my-app --git-fork-protection
  - Disable Git fork protection
    $ vercel project protection disable my-app --git-fork-protection
  - Enable SSO deployment protection
    $ vercel project protection enable my-app --sso
  - Disable SSO for a named project
    $ vercel project protection disable my-app --sso
```

## vercel project remove

```
  ▲ vercel project remove name
  Delete a project
```

## vercel project speed-insights

```
  ▲ vercel project speed-insights [name] [options]
  Enable Speed Insights for a project
  Options:
  -F,  --format <FORMAT>  Specify the output format (json)
       --json             Output as JSON
  Examples:
  - Enable Speed Insights for the linked project
    $ vercel project speed-insights
  - Enable Speed Insights for a named project
    $ vercel project speed-insights my-project
  - Confirm enablement as JSON (non-interactive / agents)
    $ vercel project speed-insights --json
```

## vercel project update

```
  ▲ vercel project update [name] [options]
  Update one or more project settings; omitted settings remain unchanged
  Options:
       --auto-detect <SETTING>      Reset a setting to automatic detection; repeat
                                    for build-command, dev-command, install-command,
                                    or output-directory
       --build-command <COMMAND>    Set the build command
       --dev-command <COMMAND>      Set the development command
  -F,  --format <FORMAT>            Specify the output format (json)
       --framework <SLUG>           Set the framework preset by slug; use "other" to
                                    clear the preset
       --install-command <COMMAND>  Set the install command
       --json                       Output as JSON
       --output-directory <DIR>     Set the output directory
  Examples:
  - Set the linked project framework preset to Next.js
    $ vercel project update --framework nextjs
  - Set a named project framework preset to Vite
    $ vercel project update my-project --framework vite
  - Update multiple settings in one command
    $ vercel project update my-project --build-command "pnpm build" --output-directory dist
  - Reset individual settings to automatic detection
    $ vercel project update my-project --auto-detect build-command --auto-detect output-directory
  - Clear the framework preset and return JSON
    $ vercel project update my-project --framework other --json
```

## vercel project web-analytics

```
  ▲ vercel project web-analytics [name] [options]
  Enable Web Analytics for a project
  Options:
  -F,  --format <FORMAT>  Specify the output format (json)
       --json             Output as JSON
  Examples:
  - Enable Web Analytics for the linked project
    $ vercel project web-analytics
  - Enable Web Analytics for a named project
    $ vercel project web-analytics my-project
  - Confirm enablement as JSON (non-interactive / agents)
    $ vercel project web-analytics --json
```

## vercel promote

```
  ▲ vercel promote url|deploymentId [options]
  Promote an existing Deployment to current
  Commands:
  status  [project]  Show the status of any current pending promotions
  Options:
       --timeout <TIME>  Time to wait for promotion completion [3m]
  -y,  --yes             Skip the confirmation prompt when linking a Project
  Examples:
  - Promote a Deployment using ID or URL
    $ vercel promote <deployment id|url>
```

## vercel redeploy

```
  ▲ vercel redeploy [url|deploymentId] [options]
  Rebuild and deploy a previous deployment.
  Options:
   --no-wait          Don't wait for the redeploy to finish
   --target <TARGET>  Redeploy to a specific target environment
  Examples:
  - Rebuild and deploy an existing deployment using id or url
    $ vercel redeploy my-deployment.vercel.app
  - Write Deployment URL to a file
    $ vercel redeploy my-deployment.vercel.app > deployment-url.txt
  - Rebuild and deploy an existing deployment to a specific target environment
    $ vercel redeploy my-deployment.vercel.app --target preview
```

## vercel rollback

```
  ▲ vercel rollback url|deploymentId [options]
  Quickly revert back to a previous deployment
  Commands:
  status  [project]  Show the status of any current pending rollbacks
  Options:
       --timeout <TIME>  Time to wait for rollback completion [3m]
  -y,  --yes             Accept default value for all prompts
  Examples:
  - Rollback a deployment using id or url
    $ vercel rollback <deployment id/url>
```

## vercel teams list

```
  ▲ vercel teams list [options]
  Show all teams that you're a member of
  Options:
  -F,  --format <FORMAT>  Specify the output format (json)
       --json             Output as JSON
       --limit <NUMBER>   Number of results to return per page (default: 20,
                          max: 100)
  -N,  --next <MS>        Show next page of results
  Examples:
  - Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch
    $ vercel teams ls --next 1584722256178
```

## vercel whoami

```
  ▲ vercel whoami [options]
  Shows the username of the currently logged in user.
  Options:
  -F,  --format <FORMAT>  Specify the output format (json)
       --json             Output as JSON
  Examples:
  - Shows the username of the currently logged in user
    $ vercel whoami
```
