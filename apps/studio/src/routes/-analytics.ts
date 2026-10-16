// Google Analytics 4 on the public pages of www.turboslide.com (Kevin, 2026-10-16: "proper google
// metrics support for all my projects"). `ANALYTICS_BOOT_SCRIPT` runs in the document's head with
// the request's CSP nonce (__root.tsx). On the production host or its apex twin, and on a page of
// the product site or the docs, it sets the Consent Mode v2 defaults before gtag.js loads and then
// loads gtag.js with the same nonce; previews, a checkout and a self-hosted copy answer on other
// hosts and load nothing. The editor, the presentations list, the viewer, the presenter, print,
// embed, sign in and the device page never load it: their tab title carries a presentation's title
// and their address a deck id, a share or publish token or a device code. A client navigation from
// a measured page to any other route turns measurement off for the rest of the document
// (`stopAnalytics`, the opt out flag gtag.js reads before every hit), so the editor's title and
// address never leave the browser. Client navigations between measured pages are counted by GA4's
// enhanced measurement (history events), so no page view is sent by hand.
import { SITE } from '@turboslide/theme/brand/site';

/** The site's GA4 measurement ID. It is public: every measured page sends it. */
export const GA_MEASUREMENT_ID = 'G-V0CSJ0QT66';

const PRODUCTION_HOST = new URL(SITE.productionOrigin).hostname;

/** The hosts that load analytics: the production host and its apex twin. */
export const ANALYTICS_HOSTS: readonly string[] = [
  PRODUCTION_HOST,
  PRODUCTION_HOST.replace(/^www\./, ''),
];

/** The pages analytics measures: the product site (/home, /about, /features, /faq) and the docs. */
const MEASURED_PATH = /^\/(?:home|about|features|faq|docs)(?:\/|$)/;

/** Whether a page at this path is measured. */
export function isMeasuredPath(pathname: string): boolean {
  return MEASURED_PATH.test(pathname);
}

/**
 * The window property gtag.js reads before every hit; true turns measurement off
 * (https://developers.google.com/analytics/devguides/collection/ga4/disable-analytics).
 */
export const GA_DISABLE_KEY = `ga-disable-${GA_MEASUREMENT_ID}`;

/** Turns measurement off for the rest of the document. */
export function stopAnalytics(target: object = window): void {
  Reflect.set(target, GA_DISABLE_KEY, true);
}

/**
 * The Consent Mode v2 defaults: no ad storage or ad personalization anywhere, and visits from the
 * EEA, the UK and Switzerland measured without analytics cookies.
 */
const CONSENT_DEFAULTS =
  "gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',region:['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE','CH','GB']});" +
  "gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'granted'});";

/** The head's analytics script (the module comment above); it throws nothing and stamps nothing. */
export const ANALYTICS_BOOT_SCRIPT = `(function(){try{if(${JSON.stringify(ANALYTICS_HOSTS)}.indexOf(location.hostname)<0||!${MEASURED_PATH.toString()}.test(location.pathname))return;window.dataLayer=window.dataLayer||[];var gtag=function(){window.dataLayer.push(arguments)};${CONSENT_DEFAULTS}gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}';var c=document.currentScript;if(c&&c.nonce)s.nonce=c.nonce;document.head.appendChild(s)}catch(e){}})();`;
