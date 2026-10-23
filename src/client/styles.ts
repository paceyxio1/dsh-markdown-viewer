/**
 * The plugin's stylesheet, injected once per page.
 *
 * Everything is namespaced under `mdv-` and styled through DSH's `--dsw-*`
 * tokens so the plugin follows the app theme instead of inventing one. The
 * `data-mdv-*` attributes on the wrapper are the switch points for the layout
 * preferences, which keeps the CSS declarative: React only writes attributes.
 */

const STYLE_ID = 'dsh-markdown-viewer/style'

const CSS = `
/* ---- message wrapper ---------------------------------------------------- */
.mdv-root{display:flex;flex-direction:column;min-width:0}
.mdv-root[data-mdv-width="narrow"]{max-width:560px;margin-inline:auto}
.mdv-root[data-mdv-width="wide"]{max-width:900px;margin-inline:auto}
.mdv-root[data-mdv-width="full"]{max-width:100%}
.mdv-root[data-mdv-font="compact"]>div{font-size:15px!important;line-height:26px!important}
.mdv-root[data-mdv-font="comfortable"]>div{font-size:17px!important;line-height:31px!important}

/* ---- heading anchors ---------------------------------------------------- */
.mdv-anchor{margin-left:6px;color:var(--dsw-alias-label-caption,#b3b3b3);text-decoration:none;font-weight:400;opacity:0;transition:opacity .12s ease}
h1:hover>.mdv-anchor,h2:hover>.mdv-anchor,h3:hover>.mdv-anchor,h4:hover>.mdv-anchor,h5:hover>.mdv-anchor,h6:hover>.mdv-anchor,.mdv-anchor:focus-visible{opacity:1}
@media (prefers-reduced-motion:reduce){.mdv-anchor{transition:none}}

/* ---- table of contents -------------------------------------------------- */
.mdv-toc{margin:0 0 14px;padding:10px 14px;border:1px solid var(--dsw-alias-border-l1,#eee);border-radius:12px;background:var(--dsw-alias-bg-base,transparent)}
.mdv-toc-title{color:var(--dsw-alias-label-tertiary,#999);font-size:12px;font-weight:600;letter-spacing:.02em;text-transform:uppercase}
.mdv-toc-list{margin:6px 0 0;padding:0;list-style:none}
.mdv-toc-list li{margin:2px 0}
.mdv-toc-list a{color:var(--dsw-alias-label-secondary,#666);font-size:13px;line-height:20px;text-decoration:none;overflow-wrap:anywhere}
.mdv-toc-list a:hover{color:var(--dsw-alias-state-business-primary,#6b8cff);text-decoration:underline}
.mdv-toc-list li[data-mdv-level="3"]{padding-left:14px}
.mdv-toc-list li[data-mdv-level="4"]{padding-left:28px}
.mdv-toc-list li[data-mdv-level="5"]{padding-left:42px}
.mdv-toc-list li[data-mdv-level="6"]{padding-left:56px}

/* ---- collapsible code -------------------------------------------------- */
/* Attribute-only: no extra element is inserted, so React's tree stays intact. */
pre[data-mdv-code]{position:relative;cursor:pointer}
pre[data-mdv-code="collapsed"]{max-height:220px;overflow:hidden}
pre[data-mdv-code="collapsed"]:after{content:"";position:absolute;inset-inline:0;bottom:0;height:64px;background:linear-gradient(to bottom,transparent,var(--dsw-alias-markdown-code-block,#1e1e1e));pointer-events:none}
pre[data-mdv-code="collapsed"]:before{content:attr(data-mdv-hint);position:absolute;bottom:8px;left:50%;transform:translateX(-50%);z-index:1;padding:2px 10px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.16));color:var(--dsw-alias-label-secondary,#ccc);font:500 12px/18px var(--dsw-font-sans,system-ui,sans-serif);pointer-events:none}
pre[data-mdv-code="expanded"]:before{content:attr(data-mdv-hint);position:absolute;top:8px;right:12px;z-index:1;padding:1px 8px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.16));color:var(--dsw-alias-label-secondary,#ccc);font:500 12px/18px var(--dsw-font-sans,system-ui,sans-serif);pointer-events:none;opacity:.7}

/* ---- sidebar document preview ------------------------------------------ */
/* Replacement modes hide the native output and show the appended node only. */
[data-mdv-sidebar-mode="plain"] [data-document-markdown]>:not([data-mdv-sidebar]),
[data-mdv-sidebar-mode="raw"] [data-document-markdown]>:not([data-mdv-sidebar]){display:none!important}
[data-document-preview] [data-document-markdown] .mdv-plain,[data-document-preview] [data-document-markdown] .mdv-raw{margin:0}
[data-document-preview][data-mdv-font="compact"] [data-document-markdown]{font-size:14px!important;line-height:24px!important}
[data-document-preview][data-mdv-font="comfortable"] [data-document-markdown]{font-size:17px!important;line-height:30px!important}
[data-document-preview][data-mdv-width="narrow"] [data-document-markdown]{max-width:560px;margin-inline:auto}
[data-document-preview][data-mdv-width="wide"] [data-document-markdown]{max-width:900px;margin-inline:auto}
[data-document-preview][data-mdv-width="full"] [data-document-markdown]{max-width:100%}

/* ---- plain / raw rendering --------------------------------------------- */
.mdv-content{display:flex;flex-direction:column;gap:16px;color:var(--dsw-alias-label-primary,#222);font-size:16px;line-height:28px}
.mdv-plain{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
.mdv-raw{margin:0;padding:12px 16px;border:1px solid var(--dsw-alias-border-l1,#eee);border-radius:12px;background:var(--dsw-alias-markdown-code-block,rgba(127,127,127,.08));color:var(--dsw-alias-label-primary,#222);font:var(--dsw-font-markdown-code-block-small,13px/22px ui-monospace,SFMono-Regular,Menlo,monospace);white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto}
.mdv-think{border-left:2px solid var(--dsw-alias-border-l2,#ddd);padding-left:12px;color:var(--dsw-alias-label-tertiary,#999)}
.mdv-think>summary{cursor:pointer;color:var(--dsw-alias-label-tertiary,#999);font-size:13px;font-weight:600;list-style:none}
.mdv-think>summary::-webkit-details-marker{display:none}
.mdv-think>summary:before{content:"▸ ";display:inline-block;transition:transform .12s ease}
.mdv-think[open]>summary:before{content:"▾ "}
.mdv-think-body{margin:6px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:24px}
.mdv-images{display:flex;flex-wrap:wrap;gap:8px}
.mdv-image{display:block;max-width:260px;max-height:220px;border-radius:12px;object-fit:contain;border:1px solid var(--dsw-alias-border-l1,#eee)}
.mdv-stopped{align-self:flex-start;padding:0 6px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-tertiary,#999);font-size:11px;line-height:18px}
.mdv-empty{color:var(--dsw-alias-label-tertiary,#999);font-size:14px}

/* ---- settings page ----------------------------------------------------- */
.mdv-settings{display:flex;flex-direction:column;gap:4px;padding:2px 0 24px;color:var(--dsw-alias-label-primary,#222);font:14px/22px var(--dsw-font-sans,system-ui,sans-serif)}
.mdv-settings-title{font-size:16px;font-weight:600;line-height:26px;margin:0}
.mdv-settings-intro{margin:2px 0 14px;color:var(--dsw-alias-label-tertiary,#999);font-size:13px;line-height:21px}
.mdv-group{margin-top:18px;display:flex;flex-direction:column}
.mdv-group-title{color:var(--dsw-alias-label-tertiary,#999);font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-bottom:2px}
.mdv-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:1px solid var(--dsw-alias-border-l1,#f0f0f0)}
.mdv-row:last-child{border-bottom:0}
.mdv-row-text{min-width:0}
.mdv-row-title{color:var(--dsw-alias-label-primary,#222)}
.mdv-row-desc{margin-top:2px;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:19px}
.mdv-row-control{flex:none;display:flex;align-items:center;gap:8px}
.mdv-switch{position:relative;flex:none;width:40px;height:22px;padding:0;border:0;border-radius:11px;background:var(--dsw-alias-border-l2,#d4d4d4);cursor:pointer;transition:background .15s ease}
.mdv-switch[aria-checked="true"]{background:var(--dsw-alias-state-business-primary,#4d6bfe)}
.mdv-switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:2px}
.mdv-switch:disabled{opacity:.45;cursor:default}
.mdv-switch-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.24);transition:transform .15s ease}
.mdv-switch[aria-checked="true"] .mdv-switch-knob{transform:translateX(18px)}
@media (prefers-reduced-motion:reduce){.mdv-switch,.mdv-switch-knob{transition:none}}
.mdv-segmented{display:inline-flex;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-base,transparent)}
.mdv-segment{border:0;border-right:1px solid var(--dsw-alias-border-l2,#ddd);background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;font:inherit;font-size:13px;padding:5px 12px;white-space:nowrap}
.mdv-segment:last-child{border-right:0}
.mdv-segment:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.mdv-segment[aria-pressed="true"]{background:var(--dsw-alias-state-business-primary,#4d6bfe);color:#fff}
.mdv-segment:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:-2px}
.mdv-select{border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:9px;background:transparent;color:var(--dsw-alias-label-primary,#222);cursor:pointer;font:inherit;font-size:13px;padding:5px 8px}
.mdv-select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:1px}
.mdv-mode-note{margin:2px 0 6px;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:19px}
.mdv-reset{align-self:flex-start;margin-top:20px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;font:inherit;padding:6px 14px}
.mdv-reset:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#222)}
.mdv-reset-done{margin-left:10px;color:var(--dsw-alias-state-success-primary,#2ea043);font-size:13px}
.mdv-disabled{opacity:.5;pointer-events:none}
`

/** Inject the stylesheet once; safe to call on every plugin load. */
export function installStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.append(style)
}
