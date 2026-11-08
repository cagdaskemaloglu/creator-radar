// A single unreadable tag is not evidence of a source-wide access restriction.
// Only the browser adapter emits this error after applying the normal source gates.
export class InstagramTagReadError extends Error{
 constructor(readonly reason:'tag_layout_unreadable'|'tag_load_failed',message:string){super(message);}
}
export function isLegacyTagLayoutReason(reason:string|null|undefined){return /^INSTAGRAM_STOP:layout: Tag result links unavailable after bounded render wait; main text length=\d+; page kept open for manual inspection$/.test(reason??'');}
