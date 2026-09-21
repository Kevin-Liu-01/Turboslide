# Judge seller, 2026-09-20. Reads thesvg.org's registry.json (fetched the same day with curl into the
# scratchpad) and counts how many of the brand names a General Translation seller or marketer types
# into a logo search are matched on title, slug or alias. The list is the judge's own: customers and
# prospects of a localisation company, its competitors, and the enterprise marks a sales deck names.
import json, sys
d = json.load(open(sys.argv[1]))
icons = d['icons']
names = {}
for i in icons:
    for k in [i['title'].lower(), i['slug'].lower()] + [a.lower() for a in i.get('aliases', [])]:
        names.setdefault(k, i['slug'])
sellers = ['salesforce','hubspot','shopify','zendesk','atlassian','notion','slack','figma','stripe','servicenow','workday','sap','oracle','adobe','airbnb','uber','spotify','netflix','duolingo','canva','miro','lokalise','phrase','smartling','crowdin','transifex','weglot','deepl','lilt','outreach','gong','zoominfo','apollo','pandadoc','docusign','klaviyo','mailchimp','intercom','twilio','segment','amplitude','mixpanel','datadog','snowflake','databricks','mongodb','cloudflare','vercel','supabase','linear','loom','calendly','asana','monday','clickup','airtable','webflow','framer','wix','squarespace','coinbase','robinhood','revolut','wise','klarna','brex','ramp','rippling','gusto','deel','remote','microsoft','google','amazon','apple','meta','openai','anthropic','nvidia','ibm','accenture','deloitte','mckinsey','nike','coca-cola','toyota','siemens','unilever','pfizer','jpmorgan','goldman sachs','visa','mastercard','walmart','target','ikea','zara','h&m','lego','sony','samsung','lg','philips','bosch','volkswagen','bmw','mercedes-benz','tesla','ford','general motors','boeing','airbus','fedex','ups','dhl','marriott','hilton','expedia','booking.com','zoom','dropbox','box','okta','crowdstrike','palo alto networks','zscaler','splunk','servicetitan','toast','square','paypal','adyen','shopify plus','bigcommerce','magento','contentful','sanity','storyblok','wordpress','hygraph','strapi','prismic','builder.io','gtm','general translation','locadex']
hits = [s for s in sellers if s in names]
miss = [s for s in sellers if s not in names]
print('registry total', d.get('total'), 'icons', len(icons))
print('names checked', len(sellers), 'present', len(hits), 'missing', len(miss))
print('missing:', ', '.join(miss))
loc = ['lokalise','phrase','smartling','weglot','lilt','crowdin','transifex','deepl']
print('localisation names present:', [s for s in loc if s in names])
print('localisation names missing:', [s for s in loc if s not in names])
