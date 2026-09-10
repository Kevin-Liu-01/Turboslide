// The schema surface the linter reads, named in one place (SPEC 4.2; packages/schema/src). Every
// rule imports from here so the dependency on @turboslide/schema is visible as one list and a
// renamed schema export is a one-line change. Types and the three helper groups only; no `export *`.
export type {
  Deck,
  Section,
  Slide,
  ContentSlide,
  OpenerSlide,
  MoodSlide,
  ClosingSlide,
  TitleSlide,
  StatementSlide,
  Layout,
  SlotName,
  SlideKind,
  DeckDocument,
} from '@turboslide/schema/deck';
export { slideBlocks, slideOrder, slideTitle, sectionOfSlide } from '@turboslide/schema/deck';
export type {
  Block,
  BlockType,
  Diagram,
  Icon,
  RowItem,
  PlainItem,
  HtmlBlock,
  DiaBlock,
  RowsBlock,
  HeadingBlock,
  ParagraphBlock,
  ShotBlock,
} from '@turboslide/schema/blocks';
export type { Asset, AssetSource, AssetTwins } from '@turboslide/schema/assets';
export { isShareAlike } from '@turboslide/schema/assets';
export type { Finding, KnownFinding, Severity, FindingSource } from '@turboslide/schema/findings';
export { findingId, isKnownFinding } from '@turboslide/schema/findings';
export type { RuleId, Rule, RuleLayer, FindingKind } from '@turboslide/schema/rules';
export { RULES, RULE_IDS, isRuleId } from '@turboslide/schema/rules';
export type { Mutation } from '@turboslide/schema/mutations';
export type { Box, RenderRecord } from '@turboslide/schema/render';
export type { SlideId, BlockId, AssetId, SectionId } from '@turboslide/schema/ids';
export type { Text } from '@turboslide/schema/text';
export { ICON_NAMES } from '@turboslide/schema/icons';
