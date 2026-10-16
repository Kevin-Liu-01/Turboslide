import { useRouter } from '@tanstack/react-router';

/**
 * A page's structured data (schema.org JSON-LD) as a data block in the page, with the request's
 * CSP nonce as /home gives its Speculation Rules. `<` is written as `<`, so no text of the
 * data can close the script element. The origin can differ between the build's prerender and a
 * preview's client, so the text is not compared on hydration.
 */
export function JsonLd({ data }: { data: object }) {
  const nonce = useRouter().options.ssr?.nonce;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replaceAll('<', '\\u003c') }}
    />
  );
}
