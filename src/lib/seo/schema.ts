import type { PageFacts } from './extract';

export type SchemaTypeKey =
  | 'Organization'
  | 'LocalBusiness'
  | 'WebSite'
  | 'Article'
  | 'Product'
  | 'Service'
  | 'FAQPage'
  | 'BreadcrumbList';

export type SchemaFieldKind = 'text' | 'textarea' | 'url' | 'number' | 'date' | 'pairs' | 'list';

export type SchemaFieldSpec = {
  name: string;
  label: string;
  kind: SchemaFieldKind;
  required: boolean;
  placeholder?: string;
  help?: string;
};

export type SchemaTemplate = {
  key: SchemaTypeKey;
  label: string;
  description: string;
  /** What this markup can win in the SERP. */
  richResult: string;
  docs: string;
  fields: SchemaFieldSpec[];
};

export const SCHEMA_TEMPLATES: Record<SchemaTypeKey, SchemaTemplate> = {
  Organization: {
    key: 'Organization',
    label: 'Organization',
    description: 'Company-level identity markup for the site root.',
    richResult: 'Knowledge panel, brand logo in search results',
    docs: 'https://developers.google.com/search/docs/appearance/structured-data/organization',
    fields: [
      { name: 'name', label: 'Organization name', kind: 'text', required: true },
      { name: 'url', label: 'Website URL', kind: 'url', required: true },
      { name: 'logo', label: 'Logo URL', kind: 'url', required: true, help: 'Minimum 112×112 px' },
      { name: 'description', label: 'Description', kind: 'textarea', required: false },
      { name: 'telephone', label: 'Telephone', kind: 'text', required: false },
      { name: 'email', label: 'Email', kind: 'text', required: false },
      { name: 'streetAddress', label: 'Street address', kind: 'text', required: false },
      { name: 'addressLocality', label: 'City', kind: 'text', required: false },
      { name: 'addressRegion', label: 'State / region', kind: 'text', required: false },
      { name: 'postalCode', label: 'Postal code', kind: 'text', required: false },
      { name: 'addressCountry', label: 'Country code', kind: 'text', required: false, placeholder: 'US' },
      {
        name: 'sameAs',
        label: 'Social profiles',
        kind: 'list',
        required: false,
        help: 'One URL per line',
      },
    ],
  },
  LocalBusiness: {
    key: 'LocalBusiness',
    label: 'LocalBusiness',
    description: 'Physical or service-area business with hours and location.',
    richResult: 'Local pack eligibility, hours and rating in the SERP',
    docs: 'https://developers.google.com/search/docs/appearance/structured-data/local-business',
    fields: [
      { name: 'name', label: 'Business name', kind: 'text', required: true },
      { name: 'url', label: 'Website URL', kind: 'url', required: true },
      { name: 'telephone', label: 'Telephone', kind: 'text', required: true },
      { name: 'streetAddress', label: 'Street address', kind: 'text', required: true },
      { name: 'addressLocality', label: 'City', kind: 'text', required: true },
      { name: 'addressRegion', label: 'State / region', kind: 'text', required: true },
      { name: 'postalCode', label: 'Postal code', kind: 'text', required: true },
      { name: 'addressCountry', label: 'Country code', kind: 'text', required: true, placeholder: 'US' },
      { name: 'image', label: 'Image URL', kind: 'url', required: false },
      { name: 'priceRange', label: 'Price range', kind: 'text', required: false, placeholder: '$$' },
      { name: 'latitude', label: 'Latitude', kind: 'number', required: false },
      { name: 'longitude', label: 'Longitude', kind: 'number', required: false },
      {
        name: 'openingHours',
        label: 'Opening hours',
        kind: 'pairs',
        required: false,
        help: 'One per line: Mo,Tu,We,Th,Fr | 09:00-17:00',
      },
      { name: 'sameAs', label: 'Social profiles', kind: 'list', required: false, help: 'One URL per line' },
    ],
  },
  WebSite: {
    key: 'WebSite',
    label: 'WebSite + SearchAction',
    description: 'Site identity plus the sitelinks search box.',
    richResult: 'Sitelinks search box',
    docs: 'https://developers.google.com/search/docs/appearance/structured-data/sitelinks-searchbox',
    fields: [
      { name: 'name', label: 'Site name', kind: 'text', required: true },
      { name: 'url', label: 'Site URL', kind: 'url', required: true },
      {
        name: 'searchUrl',
        label: 'Search URL pattern',
        kind: 'url',
        required: false,
        placeholder: 'https://example.com/search?q={search_term_string}',
      },
      { name: 'alternateName', label: 'Alternate name', kind: 'text', required: false },
    ],
  },
  Article: {
    key: 'Article',
    label: 'Article / BlogPosting',
    description: 'Editorial content with author and publish dates.',
    richResult: 'Top stories, article rich result, Discover eligibility',
    docs: 'https://developers.google.com/search/docs/appearance/structured-data/article',
    fields: [
      { name: 'headline', label: 'Headline', kind: 'text', required: true, help: 'Keep under 110 characters' },
      { name: 'description', label: 'Description', kind: 'textarea', required: false },
      { name: 'image', label: 'Featured image URL', kind: 'url', required: true },
      { name: 'authorName', label: 'Author name', kind: 'text', required: true },
      { name: 'authorUrl', label: 'Author profile URL', kind: 'url', required: false },
      { name: 'publisherName', label: 'Publisher name', kind: 'text', required: true },
      { name: 'publisherLogo', label: 'Publisher logo URL', kind: 'url', required: true },
      { name: 'datePublished', label: 'Date published', kind: 'date', required: true },
      { name: 'dateModified', label: 'Date modified', kind: 'date', required: false },
      { name: 'url', label: 'Canonical URL', kind: 'url', required: true },
    ],
  },
  Product: {
    key: 'Product',
    label: 'Product',
    description: 'Sellable product with price and availability.',
    richResult: 'Price, availability and review stars in the SERP',
    docs: 'https://developers.google.com/search/docs/appearance/structured-data/product',
    fields: [
      { name: 'name', label: 'Product name', kind: 'text', required: true },
      { name: 'image', label: 'Image URL', kind: 'url', required: true },
      { name: 'description', label: 'Description', kind: 'textarea', required: false },
      { name: 'sku', label: 'SKU', kind: 'text', required: false },
      { name: 'brand', label: 'Brand', kind: 'text', required: false },
      { name: 'price', label: 'Price', kind: 'number', required: true },
      { name: 'priceCurrency', label: 'Currency', kind: 'text', required: true, placeholder: 'USD' },
      {
        name: 'availability',
        label: 'Availability',
        kind: 'text',
        required: true,
        placeholder: 'InStock',
        help: 'InStock, OutOfStock, PreOrder, BackOrder',
      },
      { name: 'url', label: 'Product URL', kind: 'url', required: true },
      { name: 'ratingValue', label: 'Rating value', kind: 'number', required: false },
      { name: 'reviewCount', label: 'Review count', kind: 'number', required: false },
    ],
  },
  Service: {
    key: 'Service',
    label: 'Service',
    description: 'A service offered in a defined area.',
    richResult: 'Entity understanding for service queries',
    docs: 'https://schema.org/Service',
    fields: [
      { name: 'name', label: 'Service name', kind: 'text', required: true },
      { name: 'description', label: 'Description', kind: 'textarea', required: true },
      { name: 'providerName', label: 'Provider name', kind: 'text', required: true },
      { name: 'providerUrl', label: 'Provider URL', kind: 'url', required: false },
      { name: 'serviceType', label: 'Service type', kind: 'text', required: false },
      { name: 'areaServed', label: 'Areas served', kind: 'list', required: false, help: 'One per line' },
      { name: 'url', label: 'Page URL', kind: 'url', required: false },
    ],
  },
  FAQPage: {
    key: 'FAQPage',
    label: 'FAQPage',
    description: 'Question and answer pairs published on the page.',
    richResult: 'FAQ rich result (limited) and AI-answer citation surface',
    docs: 'https://developers.google.com/search/docs/appearance/structured-data/faqpage',
    fields: [
      {
        name: 'faqs',
        label: 'Questions and answers',
        kind: 'pairs',
        required: true,
        help: 'One per line: Question text | Answer text',
      },
    ],
  },
  BreadcrumbList: {
    key: 'BreadcrumbList',
    label: 'BreadcrumbList',
    description: 'Site hierarchy for the URL path shown in results.',
    richResult: 'Breadcrumb trail replaces the raw URL in the SERP',
    docs: 'https://developers.google.com/search/docs/appearance/structured-data/breadcrumb',
    fields: [
      {
        name: 'items',
        label: 'Breadcrumb trail',
        kind: 'pairs',
        required: true,
        help: 'One per line, in order: Name | https://example.com/path',
      },
    ],
  },
};

export type SchemaIssue = {
  severity: 'error' | 'warning';
  field: string;
  message: string;
};

export type BuildSchemaResult = {
  json: Record<string, unknown> | null;
  jsonText: string;
  scriptTag: string;
  issues: SchemaIssue[];
  validatorUrl: string;
};

function splitLines(value: string | undefined) {
  return (value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitPairs(value: string | undefined) {
  return splitLines(value)
    .map((line) => {
      const separator = line.indexOf('|');
      if (separator === -1) return null;
      return {
        left: line.slice(0, separator).trim(),
        right: line.slice(separator + 1).trim(),
      };
    })
    .filter((pair): pair is { left: string; right: string } => !!pair && !!pair.left && !!pair.right);
}

function isUrlish(value: string) {
  return /^https?:\/\/[^\s]+\.[^\s]+/i.test(value);
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}(T[\d:.+Z-]+)?$/.test(value);
}

function postalAddress(values: Record<string, string>) {
  const address: Record<string, string> = { '@type': 'PostalAddress' };
  const map: Record<string, string> = {
    streetAddress: 'streetAddress',
    addressLocality: 'addressLocality',
    addressRegion: 'addressRegion',
    postalCode: 'postalCode',
    addressCountry: 'addressCountry',
  };
  let filled = false;
  for (const [source, target] of Object.entries(map)) {
    if (values[source]?.trim()) {
      address[target] = values[source].trim();
      filled = true;
    }
  }
  return filled ? address : null;
}

function buildJson(type: SchemaTypeKey, values: Record<string, string>) {
  const value = (name: string) => values[name]?.trim() || '';
  const base: Record<string, unknown> = { '@context': 'https://schema.org' };

  switch (type) {
    case 'Organization':
    case 'LocalBusiness': {
      const node: Record<string, unknown> = {
        ...base,
        '@type': type,
        name: value('name'),
        url: value('url'),
      };
      if (value('description')) node.description = value('description');
      if (value('logo')) node.logo = { '@type': 'ImageObject', url: value('logo') };
      if (value('image')) node.image = value('image');
      if (value('telephone')) node.telephone = value('telephone');
      if (value('email')) node.email = value('email');
      if (value('priceRange')) node.priceRange = value('priceRange');

      const address = postalAddress(values);
      if (address) node.address = address;

      if (value('latitude') && value('longitude')) {
        node.geo = {
          '@type': 'GeoCoordinates',
          latitude: Number(value('latitude')),
          longitude: Number(value('longitude')),
        };
      }

      const hours = splitPairs(values.openingHours);
      if (hours.length) {
        node.openingHoursSpecification = hours.map((pair) => {
          const [opens, closes] = pair.right.split('-').map((part) => part.trim());
          return {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: pair.left.split(',').map((day) => day.trim()),
            opens,
            closes,
          };
        });
      }

      const sameAs = splitLines(values.sameAs);
      if (sameAs.length) node.sameAs = sameAs;
      return node;
    }

    case 'WebSite': {
      const node: Record<string, unknown> = {
        ...base,
        '@type': 'WebSite',
        name: value('name'),
        url: value('url'),
      };
      if (value('alternateName')) node.alternateName = value('alternateName');
      if (value('searchUrl')) {
        node.potentialAction = {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: value('searchUrl') },
          'query-input': 'required name=search_term_string',
        };
      }
      return node;
    }

    case 'Article': {
      const node: Record<string, unknown> = {
        ...base,
        '@type': 'Article',
        headline: value('headline'),
        image: value('image') ? [value('image')] : undefined,
        datePublished: value('datePublished'),
        author: {
          '@type': 'Person',
          name: value('authorName'),
          ...(value('authorUrl') ? { url: value('authorUrl') } : {}),
        },
        publisher: {
          '@type': 'Organization',
          name: value('publisherName'),
          ...(value('publisherLogo')
            ? { logo: { '@type': 'ImageObject', url: value('publisherLogo') } }
            : {}),
        },
      };
      if (value('description')) node.description = value('description');
      if (value('dateModified')) node.dateModified = value('dateModified');
      if (value('url')) node.mainEntityOfPage = { '@type': 'WebPage', '@id': value('url') };
      return node;
    }

    case 'Product': {
      const node: Record<string, unknown> = {
        ...base,
        '@type': 'Product',
        name: value('name'),
        image: value('image') ? [value('image')] : undefined,
        offers: {
          '@type': 'Offer',
          price: value('price'),
          priceCurrency: value('priceCurrency') || 'USD',
          availability: `https://schema.org/${value('availability') || 'InStock'}`,
          ...(value('url') ? { url: value('url') } : {}),
        },
      };
      if (value('description')) node.description = value('description');
      if (value('sku')) node.sku = value('sku');
      if (value('brand')) node.brand = { '@type': 'Brand', name: value('brand') };
      if (value('ratingValue') && value('reviewCount')) {
        node.aggregateRating = {
          '@type': 'AggregateRating',
          ratingValue: value('ratingValue'),
          reviewCount: value('reviewCount'),
        };
      }
      return node;
    }

    case 'Service': {
      const node: Record<string, unknown> = {
        ...base,
        '@type': 'Service',
        name: value('name'),
        description: value('description'),
        provider: {
          '@type': 'Organization',
          name: value('providerName'),
          ...(value('providerUrl') ? { url: value('providerUrl') } : {}),
        },
      };
      if (value('serviceType')) node.serviceType = value('serviceType');
      const areas = splitLines(values.areaServed);
      if (areas.length) node.areaServed = areas.map((area) => ({ '@type': 'Place', name: area }));
      if (value('url')) node.url = value('url');
      return node;
    }

    case 'FAQPage': {
      const faqs = splitPairs(values.faqs);
      return {
        ...base,
        '@type': 'FAQPage',
        mainEntity: faqs.map((pair) => ({
          '@type': 'Question',
          name: pair.left,
          acceptedAnswer: { '@type': 'Answer', text: pair.right },
        })),
      };
    }

    case 'BreadcrumbList': {
      const items = splitPairs(values.items);
      return {
        ...base,
        '@type': 'BreadcrumbList',
        itemListElement: items.map((pair, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: pair.left,
          item: pair.right,
        })),
      };
    }

    default:
      return { ...base };
  }
}

/** Strips undefined so the emitted JSON-LD has no dangling keys. */
function prune<T>(value: T): T {
  if (Array.isArray(value)) return value.map(prune) as unknown as T;
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined || item === null || item === '') continue;
      output[key] = prune(item);
    }
    return output as unknown as T;
  }
  return value;
}

export function buildSchema(
  type: SchemaTypeKey,
  values: Record<string, string>,
): BuildSchemaResult {
  const template = SCHEMA_TEMPLATES[type];
  const issues: SchemaIssue[] = [];

  for (const field of template.fields) {
    const raw = (values[field.name] || '').trim();

    if (field.required && !raw) {
      issues.push({
        severity: 'error',
        field: field.name,
        message: `${field.label} is required by Google for ${template.label}.`,
      });
      continue;
    }
    if (!raw) continue;

    if (field.kind === 'url' && !isUrlish(raw)) {
      issues.push({
        severity: 'error',
        field: field.name,
        message: `${field.label} must be an absolute URL starting with http(s)://.`,
      });
    }
    if (field.kind === 'number' && Number.isNaN(Number(raw))) {
      issues.push({
        severity: 'error',
        field: field.name,
        message: `${field.label} must be a number.`,
      });
    }
    if (field.kind === 'date' && !isIsoDate(raw)) {
      issues.push({
        severity: 'error',
        field: field.name,
        message: `${field.label} must be ISO 8601 (YYYY-MM-DD).`,
      });
    }
    if (field.kind === 'pairs' && splitPairs(raw).length === 0) {
      issues.push({
        severity: 'error',
        field: field.name,
        message: `${field.label}: use "left | right" on each line.`,
      });
    }
    if (field.kind === 'list') {
      for (const line of splitLines(raw)) {
        if (field.name === 'sameAs' && !isUrlish(line)) {
          issues.push({
            severity: 'warning',
            field: field.name,
            message: `"${line}" is not an absolute URL.`,
          });
        }
      }
    }
  }

  // Type-specific guidance beyond required/format checks.
  if (type === 'Article' && values.headline && values.headline.trim().length > 110) {
    issues.push({
      severity: 'warning',
      field: 'headline',
      message: 'Google truncates headline at 110 characters.',
    });
  }
  if (type === 'Product' && values.ratingValue && !values.reviewCount) {
    issues.push({
      severity: 'warning',
      field: 'reviewCount',
      message: 'aggregateRating needs reviewCount or ratingCount to be eligible.',
    });
  }
  if (type === 'FAQPage' && splitPairs(values.faqs).length > 0) {
    issues.push({
      severity: 'warning',
      field: 'faqs',
      message:
        'Every Q&A in the markup must also be visible on the page — hidden FAQ content is a manual-action risk.',
    });
  }

  const hasBlockingError = issues.some((issue) => issue.severity === 'error');
  const json = hasBlockingError ? null : prune(buildJson(type, values));
  const jsonText = json ? JSON.stringify(json, null, 2) : '';

  return {
    json,
    jsonText,
    scriptTag: jsonText
      ? `<script type="application/ld+json">\n${jsonText}\n</script>`
      : '',
    issues,
    validatorUrl: 'https://search.google.com/test/rich-results',
  };
}

export type DetectedEntity = {
  types: string[];
  blockIndex: number;
  keyValues: { key: string; value: string }[];
  missingRequired: string[];
  known: boolean;
};

export type SchemaDetection = {
  url: string;
  blocks: number;
  parseErrors: { blockIndex: number; error: string }[];
  entities: DetectedEntity[];
  microdataItems: number;
  recommendations: { type: SchemaTypeKey; reason: string }[];
  prefill: Partial<Record<SchemaTypeKey, Record<string, string>>>;
};

const REQUIRED_BY_TYPE: Partial<Record<string, string[]>> = {
  Organization: ['name', 'url', 'logo'],
  LocalBusiness: ['name', 'address', 'telephone'],
  Article: ['headline', 'image', 'author', 'datePublished'],
  BlogPosting: ['headline', 'image', 'author', 'datePublished'],
  NewsArticle: ['headline', 'image', 'author', 'datePublished'],
  Product: ['name', 'image', 'offers'],
  FAQPage: ['mainEntity'],
  BreadcrumbList: ['itemListElement'],
  WebSite: ['name', 'url'],
  Service: ['name', 'provider'],
};

function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.length > 90 ? `${value.slice(0, 89)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} item(s)`;
  const type = (value as Record<string, unknown>)['@type'];
  return typeof type === 'string' ? `{${type}}` : '{object}';
}

export function detectSchema(facts: PageFacts): SchemaDetection {
  const entities: DetectedEntity[] = [];

  for (const block of facts.jsonLd) {
    for (const entity of block.entities) {
      const rawType = entity['@type'];
      const types = Array.isArray(rawType)
        ? rawType.filter((item): item is string => typeof item === 'string')
        : typeof rawType === 'string'
          ? [rawType]
          : [];

      const required = types.flatMap((type) => REQUIRED_BY_TYPE[type] ?? []);
      entities.push({
        types,
        blockIndex: block.index,
        keyValues: Object.entries(entity)
          .filter(([key]) => key !== '@context')
          .slice(0, 8)
          .map(([key, value]) => ({ key, value: summarizeValue(value) })),
        missingRequired: Array.from(new Set(required)).filter((key) => !(key in entity)),
        known: required.length > 0,
      });
    }
  }

  // ── What is worth adding, based on what the page actually contains ──
  const presentTypes = new Set(facts.schemaTypes);
  const recommendations: { type: SchemaTypeKey; reason: string }[] = [];
  const isHome = facts.path === '/' || facts.path === '';

  if (!presentTypes.has('Organization') && !presentTypes.has('LocalBusiness')) {
    recommendations.push({
      type: isHome ? 'Organization' : 'Organization',
      reason: 'No brand entity on the page — Organization markup is the anchor for a knowledge panel.',
    });
  }
  if (isHome && !presentTypes.has('WebSite')) {
    recommendations.push({
      type: 'WebSite',
      reason: 'Home page without WebSite markup — you lose sitelinks search box eligibility.',
    });
  }
  if (!presentTypes.has('BreadcrumbList') && facts.path.split('/').filter(Boolean).length >= 2) {
    recommendations.push({
      type: 'BreadcrumbList',
      reason: 'Nested URL path with no breadcrumb markup — the SERP shows the raw URL instead.',
    });
  }
  const questionHeadings = facts.headings.filter(
    (heading) => heading.level >= 2 && /\?$/.test(heading.text),
  );
  if (questionHeadings.length >= 2 && !presentTypes.has('FAQPage')) {
    recommendations.push({
      type: 'FAQPage',
      reason: `${questionHeadings.length} question-style headings found but no FAQPage markup.`,
    });
  }
  const articleish =
    !isHome &&
    facts.wordCount > 700 &&
    !presentTypes.has('Article') &&
    !presentTypes.has('BlogPosting') &&
    !presentTypes.has('NewsArticle');
  if (articleish) {
    recommendations.push({
      type: 'Article',
      reason: `${facts.wordCount} words of editorial content with no Article markup.`,
    });
  }

  // ── Prefill the generator from what we already know about the page ──
  const brandGuess =
    facts.og.site_name ||
    facts.hostname
      .replace(/^www\./, '')
      .split('.')[0]
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  // Only prefill from og:image when it is actually a usable absolute URL —
  // real pages ship values like `content="https:"`.
  const logoGuess = isUrlish(facts.og.image || '') ? facts.og.image : '';

  const prefill: SchemaDetection['prefill'] = {
    Organization: {
      name: brandGuess,
      url: facts.origin,
      logo: logoGuess,
      description: facts.metaDescription,
    },
    LocalBusiness: { name: brandGuess, url: facts.origin, image: logoGuess },
    WebSite: {
      name: brandGuess,
      url: facts.origin,
      searchUrl: `${facts.origin}/search?q={search_term_string}`,
    },
    Article: {
      headline: facts.h1[0] || facts.title,
      description: facts.metaDescription,
      image: logoGuess,
      publisherName: brandGuess,
      publisherLogo: logoGuess,
      url: facts.canonical || facts.url,
      datePublished: new Date().toISOString().slice(0, 10),
    },
    Service: {
      name: facts.h1[0] || facts.title,
      description: facts.metaDescription,
      providerName: brandGuess,
      providerUrl: facts.origin,
      url: facts.canonical || facts.url,
    },
    FAQPage: {
      faqs: questionHeadings
        .slice(0, 6)
        .map((heading) => `${heading.text} | `)
        .join('\n'),
    },
    BreadcrumbList: {
      items: (() => {
        const segments = facts.path.split('/').filter(Boolean);
        const rows = [`Home | ${facts.origin}/`];
        let accumulated = '';
        for (const segment of segments) {
          accumulated += `/${segment}`;
          const name = decodeURIComponent(segment)
            .replace(/[-_]+/g, ' ')
            .replace(/\.(html?|php|aspx)$/i, '')
            .replace(/\b\w/g, (char) => char.toUpperCase());
          rows.push(`${name} | ${facts.origin}${accumulated}`);
        }
        return rows.join('\n');
      })(),
    },
    Product: {
      url: facts.canonical || facts.url,
      image: logoGuess,
      priceCurrency: 'USD',
      availability: 'InStock',
    },
  };

  return {
    url: facts.url,
    blocks: facts.jsonLd.length,
    parseErrors: facts.jsonLd
      .filter((block) => block.error)
      .map((block) => ({ blockIndex: block.index, error: block.error as string })),
    entities,
    microdataItems: facts.microdataItems,
    recommendations,
    prefill,
  };
}
