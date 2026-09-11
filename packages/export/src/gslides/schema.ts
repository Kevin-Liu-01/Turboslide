// The batchUpdate request shapes the exporter emits (SPEC 8.3), as strict Zod objects, so a dry
// run validates every request before anything is sent and a misspelled field fails locally instead
// of as a 400 from the API. Only the fields Turboslide writes are modelled; the API accepts more.
// Field masks are the `fields` strings of the corresponding Update*Request.
// Reference: https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/request
import { z } from 'zod';

import { OBJECT_ID_PATTERN } from './ids.ts';

export const objectIdSchema = z.string().regex(OBJECT_ID_PATTERN, 'a Slides object id');

/** A notes placeholder in a dry run: `notes:<page id>`, replaced by the read-back id in a live run. */
export const notesPlaceholderSchema = z.string().regex(/^notes:[a-zA-Z0-9_][a-zA-Z0-9_:-]{4,49}$/);

export const dimensionSchema = z.strictObject({
  magnitude: z.number().finite(),
  unit: z.enum(['EMU', 'PT']),
});

export const sizeSchema = z.strictObject({ width: dimensionSchema, height: dimensionSchema });

export const transformSchema = z.strictObject({
  scaleX: z.number(),
  scaleY: z.number(),
  translateX: z.number().finite(),
  translateY: z.number().finite(),
  unit: z.literal('EMU'),
});

export const elementPropertiesSchema = z.strictObject({
  pageObjectId: objectIdSchema,
  size: sizeSchema,
  transform: transformSchema,
});

export const rgbColorSchema = z.strictObject({
  red: z.number().min(0).max(1),
  green: z.number().min(0).max(1),
  blue: z.number().min(0).max(1),
});

export const opaqueColorSchema = z.strictObject({ rgbColor: rgbColorSchema });

export const solidFillSchema = z.strictObject({
  color: opaqueColorSchema,
  alpha: z.number().min(0).max(1).optional(),
});

export const textRangeSchema = z.union([
  z.strictObject({ type: z.literal('ALL') }),
  z.strictObject({
    type: z.literal('FIXED_RANGE'),
    startIndex: z.number().int().nonnegative(),
    endIndex: z.number().int().positive(),
  }),
]);

export const textStyleSchema = z.strictObject({
  fontFamily: z.string().min(1).optional(),
  weightedFontFamily: z
    .strictObject({ fontFamily: z.string().min(1), weight: z.number().int().min(100).max(900) })
    .optional(),
  fontSize: dimensionSchema.optional(),
  foregroundColor: z.strictObject({ opaqueColor: opaqueColorSchema }).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
  link: z.strictObject({ url: z.url() }).optional(),
});

export const paragraphStyleSchema = z.strictObject({
  lineSpacing: z.number().positive(),
  alignment: z.enum(['START', 'CENTER', 'END']),
  spaceAbove: dimensionSchema,
  spaceBelow: dimensionSchema,
  indentStart: dimensionSchema,
  indentEnd: dimensionSchema,
  indentFirstLine: dimensionSchema,
});

export const outlineSchema = z.union([
  z.strictObject({ propertyState: z.literal('NOT_RENDERED') }),
  z.strictObject({
    weight: dimensionSchema,
    outlineFill: z.strictObject({ solidFill: solidFillSchema }),
    dashStyle: z.literal('SOLID'),
  }),
]);

export const shapePropertiesSchema = z.strictObject({
  autofit: z.strictObject({ autofitType: z.literal('NONE') }).optional(),
  contentAlignment: z.enum(['TOP', 'MIDDLE', 'BOTTOM']).optional(),
  shapeBackgroundFill: z.strictObject({ solidFill: solidFillSchema }).optional(),
  outline: outlineSchema.optional(),
});

export const pageBackgroundFillSchema = z.union([
  z.strictObject({ solidFill: solidFillSchema }),
  z.strictObject({ stretchedPictureFill: z.strictObject({ contentUrl: z.url() }) }),
]);

const fieldsSchema = z.string().min(1);

export const requestSchema = z.union([
  z.strictObject({
    createSlide: z.strictObject({
      objectId: objectIdSchema,
      insertionIndex: z.number().int().nonnegative(),
      slideLayoutReference: z.strictObject({ predefinedLayout: z.literal('BLANK') }),
    }),
  }),
  z.strictObject({
    updatePageProperties: z.strictObject({
      objectId: objectIdSchema,
      pageProperties: z.strictObject({ pageBackgroundFill: pageBackgroundFillSchema }),
      fields: fieldsSchema,
    }),
  }),
  z.strictObject({
    createShape: z.strictObject({
      objectId: objectIdSchema,
      shapeType: z.enum(['TEXT_BOX', 'RECTANGLE']),
      elementProperties: elementPropertiesSchema,
    }),
  }),
  z.strictObject({
    insertText: z.strictObject({
      objectId: z.union([objectIdSchema, notesPlaceholderSchema]),
      insertionIndex: z.literal(0),
      text: z.string().min(1),
    }),
  }),
  z.strictObject({
    updateTextStyle: z.strictObject({
      objectId: objectIdSchema,
      textRange: textRangeSchema,
      style: textStyleSchema,
      fields: fieldsSchema,
    }),
  }),
  z.strictObject({
    updateParagraphStyle: z.strictObject({
      objectId: objectIdSchema,
      textRange: textRangeSchema,
      style: paragraphStyleSchema,
      fields: fieldsSchema,
    }),
  }),
  z.strictObject({
    updateShapeProperties: z.strictObject({
      objectId: objectIdSchema,
      shapeProperties: shapePropertiesSchema,
      fields: fieldsSchema,
    }),
  }),
  z.strictObject({
    createLine: z.strictObject({
      objectId: objectIdSchema,
      category: z.literal('STRAIGHT'),
      elementProperties: elementPropertiesSchema,
    }),
  }),
  z.strictObject({
    updateLineProperties: z.strictObject({
      objectId: objectIdSchema,
      lineProperties: z.strictObject({
        weight: dimensionSchema,
        lineFill: z.strictObject({ solidFill: solidFillSchema }),
        dashStyle: z.literal('SOLID'),
      }),
      fields: fieldsSchema,
    }),
  }),
  z.strictObject({
    createImage: z.strictObject({
      objectId: objectIdSchema,
      url: z.url(),
      elementProperties: elementPropertiesSchema,
    }),
  }),
  z.strictObject({
    groupObjects: z.strictObject({
      groupObjectId: objectIdSchema,
      childrenObjectIds: z.array(objectIdSchema).min(2),
    }),
  }),
  z.strictObject({
    deleteObject: z.strictObject({ objectId: objectIdSchema }),
  }),
]);

export type SlidesRequest = z.infer<typeof requestSchema>;
export type TextStyle = z.infer<typeof textStyleSchema>;
export type ParagraphStyle = z.infer<typeof paragraphStyleSchema>;
export type ElementProperties = z.infer<typeof elementPropertiesSchema>;
export type SolidFill = z.infer<typeof solidFillSchema>;

export const requestListSchema = z.array(requestSchema);

/** The one key of a request: `createSlide`, `insertText`, ... */
export function requestKind(request: SlidesRequest): string {
  return Object.keys(request)[0] ?? 'unknown';
}

export type ValidationIssue = { index: number; path: string; message: string };

/** Validates a request list; returns every failing request with its first issue. */
export function validateRequests(requests: readonly unknown[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  requests.forEach((request, index) => {
    const result = requestSchema.safeParse(request);
    if (result.success) return;
    const first = result.error.issues[0];
    issues.push({
      index,
      path: first ? first.path.map(String).join('/') : '',
      message: first?.message ?? 'invalid request',
    });
  });
  return issues;
}
