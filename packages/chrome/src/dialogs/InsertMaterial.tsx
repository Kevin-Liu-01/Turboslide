// Removed in the features round, ship two (docs/FEATURES.md 5.4): Insert > Shader opens the
// Shader gallery (dialogs/ShaderGallery.tsx). This shim keeps the shared tree compiling until the
// integrator's build/b1.md R2 re-points EditorShell.tsx's lazy import at ShaderGallery.tsx and
// deletes this file in the same commit; nothing else imports it.
export { ShaderGalleryDialog as InsertMaterialDialog, insertableMaterials } from './ShaderGallery';
