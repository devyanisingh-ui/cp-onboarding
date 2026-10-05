// Turns the single-file mobile build into a page for sharing as a hosted link.
// The host supplies <!doctype>, <html>, <head> and <body>, so this keeps only the page's own
// title, scripts, styles and app container — title first, since only the start is scanned for it.
//
// The app's JavaScript itself contains HTML strings (e.g. "<head>", "<style>" in the print code),
// so the cut is made by document structure, not by searching for tags:
//   head:  from the first <script> (the real one, right after the meta tags) to the LAST </head>
//   body:  between the LAST <body> and the LAST </body>
const fs = require('fs');
const src = fs.readFileSync('cp-onboarding-mobile.html', 'utf8');

const headStart = src.indexOf('<head>');
const firstScript = src.indexOf('<script', headStart);
const headEnd = src.lastIndexOf('</head>');
const bodyStart = src.lastIndexOf('<body>');
const bodyEnd = src.lastIndexOf('</body>');
if ([headStart, firstScript, headEnd, bodyStart, bodyEnd].some((i) => i < 0) || !(firstScript < headEnd && headEnd < bodyStart)) {
  throw new Error('Unexpected structure in cp-onboarding-mobile.html; rebuild it with npm run build:mobile');
}

const headAssets = src.slice(firstScript, headEnd).trim();
const body = src.slice(bodyStart + '<body>'.length, bodyEnd).trim();
if (!body.includes('<div id="root"></div>')) throw new Error('App container not found in the mobile build');

let out = `<title>CP Onboarding</title>\n${headAssets}\n${body}\n`;

// Some bundled libraries (pdf-lib's character tables) contain a literal U+FFFD inside JS string
// literals. The publisher rejects that character as likely corruption, so write it as the
// equivalent escape "�" — same string at runtime. Only done where it is a whole "…" literal.
const FFFD = '�';
let at = out.indexOf(FFFD);
while (at >= 0) {
  if (out[at - 1] !== '"' || out[at + 1] !== '"') throw new Error(`U+FFFD outside a string literal at ${at}; inspect before escaping`);
  at = out.indexOf(FFFD, at + 1);
}
out = out.split(FFFD).join('\\uFFFD');
fs.writeFileSync('cp-onboarding-share.html', out);
console.log(`cp-onboarding-share.html: ${(out.length / 1024).toFixed(0)} KB`);
