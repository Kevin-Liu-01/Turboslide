/**
 * Offers each picture's small copy (hardening HR-PC#6) to the browser. A picture whose asset has
 * one carries `data-thumb` and `data-thumb-w` (render RenderOptions.thumbs); its `srcset` names
 * the small copy beside the twin and its `sizes` the width the clone draws it at, so a filmstrip
 * frame fetches the small copy and a large preview the twin. The clone is the sheet scaled by `k`,
 * so a picture's layout box is in sheet pixels; a covering picture draws past its box on its long
 * side, so the drawn width is the larger of the box's width and its height times the twin's
 * ratio. A picture without the attributes, or whose twin is not wider than the copy, keeps its
 * `src` alone. Attributes are written only when they change, since each write restarts the
 * picture's selection.
 */
export function chooseSmallCopies(root: ParentNode, k: number): void {
  const pictures = [...root.querySelectorAll<HTMLImageElement>('img[data-thumb][data-thumb-w]')];
  // every box is read before any attribute is written, so the reads share one layout
  const boxes = pictures.map((img) => [img.offsetWidth, img.offsetHeight] as const);
  pictures.forEach((img, index) => {
    const thumb = img.getAttribute('data-thumb');
    const src = img.getAttribute('src');
    const thumbWidth = Number(img.getAttribute('data-thumb-w'));
    const width = Number(img.getAttribute('width'));
    const height = Number(img.getAttribute('height'));
    if (!thumb || !src || !(thumbWidth > 0) || !(width > thumbWidth)) return;
    const [boxWidth = 0, boxHeight = 0] = boxes[index] ?? [];
    const ratio = height > 0 ? width / height : 0;
    const laid = Math.max(boxWidth, boxHeight * ratio) || width;
    const sizes = `${Math.max(1, Math.ceil(laid * k))}px`;
    const srcset = `${thumb} ${thumbWidth}w, ${src} ${width}w`;
    if (img.getAttribute('sizes') !== sizes) img.setAttribute('sizes', sizes);
    if (img.getAttribute('srcset') !== srcset) img.setAttribute('srcset', srcset);
  });
}
