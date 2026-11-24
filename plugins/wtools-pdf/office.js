// Minimal OOXML packages keep conversion offline without a desktop Office dependency.
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
function escape(value) {
  return String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}
function relationships(items) {
  return XML + `<Relationships xmlns="${REL}">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${OFFICE}${type}" Target="${target}"/>`).join('')}</Relationships>`;
}
function types(overrides, imageType = null) {
  return XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + (imageType ? `<Default Extension="${imageType}" ContentType="image/${imageType === 'jpg' ? 'jpeg' : imageType}"/>` : '')
    + overrides.map(([name, mime]) => `<Override PartName="/${name}" ContentType="application/vnd.openxmlformats-officedocument.${mime}+xml"/>`).join('') + '</Types>';
}
async function finish(zip, name, mime, note, ctx) {
  ctx.check();
  const blob = await zip.generateAsync({ type: 'blob', mimeType: mime, compression: 'DEFLATE', compressionOptions: { level: 3 } }, () => ctx.check());
  ctx.check(); return [{ name, blob, note }];
}
function pagesFor(item, options, helpers) {
  const pages = helpers.pageNumbers(options.range || '', item.pages);
  if (pages.length > 500) throw new Error('单次最多导出 500 页，请设置页码范围。');
  return pages;
}
function lineText(line) {
  let text = '', end = 0;
  for (const cell of line.cells) {
    if (text && cell.x - end > Math.max(1, cell.height * .15) && !/\s$/.test(text)) text += ' ';
    text += cell.text; end = cell.x + cell.width;
  }
  return text;
}
export async function exportWord(item, options, ctx, h) {
  const pages = pagesFor(item, options, h), zip = new window.JSZip();
  const body = [], rels = [], imageMode = options.wordMode === 'image';
  let textCount = 0, capped = false, imageBytes = 0;
  for (let i = 0; i < pages.length; i++) {
    ctx.check();
    if (i) body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    if (imageMode) {
      const rendered = await h.renderPage(item, pages[i], options.dpi);
      try {
        const blob = await h.canvasBlob(rendered.canvas, 'image/jpeg', options.quality / 100);
        imageBytes += blob.size;
        if (imageBytes > 128 * 1024 ** 2) throw new Error('页面图片超过 128 MB，请降低分辨率或减少页码范围。');
        zip.file(`word/media/page${i + 1}.jpg`, await blob.arrayBuffer());
        const ratio = Math.min(468 / rendered.width, 680 / rendered.height);
        const cx = Math.round(rendered.width * ratio * 12700), cy = Math.round(rendered.height * ratio * 12700);
        const id = `rId${i + 1}`;
        rels.push([id, 'image', `media/page${i + 1}.jpg`]);
        body.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${i + 1}" name="第 ${pages[i]} 页"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${i + 1}" name="page${pages[i]}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
        capped ||= rendered.capped;
      } finally { h.releaseCanvas(rendered.canvas); }
    } else {
      const { lines } = await h.textLines(item, pages[i]);
      for (const line of lines) {
        const text = lineText(line); textCount += text.length;
        const size = Math.min(64, Math.max(18, Math.round(line.height * 2)));
        body.push(`<w:p><w:pPr><w:spacing w:after="80"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei"/><w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`);
      }
      if (!lines.length) body.push('<w:p><w:r><w:t>此页未检测到可提取文字（可能为扫描件）。</w:t></w:r></w:p>');
    }
    ctx.step(i + 1, pages.length); await h.pause();
  }
  if (!imageMode && !textCount) throw new Error('未检测到可提取文字；扫描件请切换「保留外观（图片）」模式。');
  body.push('<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="900" w:right="1440" w:bottom="900" w:left="1440" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>');
  zip.file('[Content_Types].xml', types([['word/document.xml', 'wordprocessingml.document.main']], imageMode ? 'jpg' : null));
  zip.file('_rels/.rels', relationships([['rId1', 'officeDocument', 'word/document.xml']]));
  if (rels.length) zip.file('word/_rels/document.xml.rels', relationships(rels));
  zip.file('word/document.xml', XML + `<w:document xmlns:w="${W}" xmlns:r="${OFFICE.slice(0, -1)}" xmlns:a="${A}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join('')}</w:body></w:document>`);
  return finish(zip, `${h.stem(item.name)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', imageMode ? '保留页面外观；页面内容为图片' + (capped ? '；超大页已限制分辨率' : '') : '可编辑文字；复杂排版、图片和表格不保留', ctx);
}

const emptyTree = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const colorMap = 'accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"';
function theme() {
  const colors = { dk1: '000000', lt1: 'FFFFFF', dk2: '334155', lt2: 'F8FAFC', accent1: 'FF575F', accent2: '7C6BF2', accent3: '36A382', accent4: 'E5AF42', accent5: '6795E9', accent6: 'BA7AB8', hlink: '2563EB', folHlink: '7C3AED' };
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = `<a:ln w="9525">${fill}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  return XML + `<a:theme xmlns:a="${A}" name="WTools"><a:themeElements><a:clrScheme name="WTools">${Object.entries(colors).map(([key, value]) => `<a:${key}><a:srgbClr val="${value}"/></a:${key}>`).join('')}</a:clrScheme><a:fontScheme name="WTools"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="WTools"><a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${line.repeat(3)}</a:lnStyleLst><a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}
export async function exportPpt(item, options, ctx, h) {
  const zip = new window.JSZip(), pages = pagesFor(item, options, h), overrides = [
    ['ppt/presentation.xml', 'presentationml.presentation.main'], ['ppt/slideMasters/slideMaster1.xml', 'presentationml.slideMaster'],
    ['ppt/slideLayouts/slideLayout1.xml', 'presentationml.slideLayout'], ['ppt/theme/theme1.xml', 'theme'],
  ];
  const presentationRels = [['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml']];
  let width = 9144000, height = 6858000, capped = false, imageBytes = 0;
  for (let i = 0; i < pages.length; i++) {
    ctx.check();
    const rendered = await h.renderPage(item, pages[i], options.dpi);
    try {
      if (!i) height = Math.round(width * Math.max(.25, Math.min(4, rendered.height / rendered.width)));
      const ratio = Math.min(width / rendered.width, height / rendered.height);
      const cx = Math.round(rendered.width * ratio), cy = Math.round(rendered.height * ratio), x = Math.round((width - cx) / 2), y = Math.round((height - cy) / 2);
      const blob = await h.canvasBlob(rendered.canvas, 'image/jpeg', options.quality / 100);
      imageBytes += blob.size;
      if (imageBytes > 128 * 1024 ** 2) throw new Error('幻灯片图片超过 128 MB，请降低分辨率或减少页码范围。');
      zip.file(`ppt/media/page${i + 1}.jpg`, await blob.arrayBuffer());
      zip.file(`ppt/slides/slide${i + 1}.xml`, XML + `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OFFICE.slice(0, -1)}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${emptyTree}<p:pic><p:nvPicPr><p:cNvPr id="2" name="PDF 第 ${pages[i]} 页"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
      zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, relationships([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'image', `../media/page${i + 1}.jpg`]]));
      overrides.push([`ppt/slides/slide${i + 1}.xml`, 'presentationml.slide']);
      presentationRels.push([`rId${i + 2}`, 'slide', `slides/slide${i + 1}.xml`]);
      capped ||= rendered.capped;
    } finally { h.releaseCanvas(rendered.canvas); }
    ctx.step(i + 1, pages.length); await h.pause();
  }
  zip.file('[Content_Types].xml', types(overrides, 'jpg'));
  zip.file('_rels/.rels', relationships([['rId1', 'officeDocument', 'ppt/presentation.xml']]));
  zip.file('ppt/presentation.xml', XML + `<p:presentation xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OFFICE.slice(0, -1)}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${pages.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${width}" cy="${height}" type="custom"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', relationships(presentationRels));
  zip.file('ppt/slideMasters/slideMaster1.xml', XML + `<p:sldMaster xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OFFICE.slice(0, -1)}"><p:cSld><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMap ${colorMap}/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', relationships([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]));
  zip.file('ppt/slideLayouts/slideLayout1.xml', XML + `<p:sldLayout xmlns:p="${P}" xmlns:a="${A}" type="blank" preserve="1"><p:cSld name="空白"><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', relationships([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]));
  zip.file('ppt/theme/theme1.xml', theme());
  return finish(zip, `${h.stem(item.name)}.pptx`, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '每页一张图片幻灯片，文字不可单独编辑' + (capped ? '；超大页已限制分辨率' : ''), ctx);
}
function columnName(index) {
  let name = '';
  for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}
function tableRows(lines, gap) {
  const rows = lines.map(line => {
    const cells = [];
    for (const entry of line.cells) {
      const previous = cells.at(-1);
      if (previous && entry.x - previous.end < gap) {
        previous.text += (entry.x - previous.end > 1 ? ' ' : '') + entry.text; previous.end = entry.x + entry.width;
      } else cells.push({ x: entry.x, end: entry.x + entry.width, text: entry.text });
    }
    return cells;
  });
  const anchors = [];
  for (const cell of rows.flat().sort((a, b) => a.x - b.x)) if (!anchors.length || cell.x - anchors.at(-1) > 8) anchors.push(cell.x);
  return rows.map(row => {
    const values = [];
    for (const cell of row) {
      const index = anchors.findIndex(x => Math.abs(x - cell.x) <= 8);
      values[index] = values[index] ? values[index] + ' ' + cell.text : cell.text;
    }
    return values;
  });
}
export async function exportExcel(item, options, ctx, h) {
  const zip = new window.JSZip(), pages = pagesFor(item, options, h), sheets = [], rels = [], overrides = [['xl/workbook.xml', 'spreadsheetml.sheet.main']];
  let count = 0;
  for (let i = 0; i < pages.length; i++) {
    ctx.check();
    const { lines } = await h.textLines(item, pages[i]);
    const rows = options.excelMode === 'lines' ? lines.map(line => [lineText(line)]) : tableRows(lines, options.columnGap);
    count += lines.length;
    if (!rows.length) rows.push(['此页未检测到可提取文字（可能为扫描件）。']);
    const width = Math.max(1, ...rows.map(row => row.length));
    if (width > 16384 || rows.length > 1048576) throw new Error('提取结果超出 Excel 工作表容量。');
    const cells = rows.map((row, n) => `<row r="${n + 1}">${row.map((text, col) => text === undefined ? '' : `<c r="${columnName(col)}${n + 1}" t="inlineStr"><is><t xml:space="preserve">${escape(text.slice(0, 32767))}</t></is></c>`).join('')}</row>`).join('');
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, XML + `<worksheet xmlns="${S}"><dimension ref="A1:${columnName(width - 1)}${rows.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="${width}" width="24" customWidth="1"/></cols><sheetData>${cells}</sheetData></worksheet>`);
    sheets.push(`<sheet name="第 ${pages[i]} 页" sheetId="${i + 1}" r:id="rId${i + 1}"/>`);
    rels.push([`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`]);
    overrides.push([`xl/worksheets/sheet${i + 1}.xml`, 'spreadsheetml.worksheet']);
    ctx.step(i + 1, pages.length); await h.pause();
  }
  if (!count) throw new Error('未检测到可提取文字。扫描件需要先进行 OCR。');
  zip.file('[Content_Types].xml', types(overrides));
  zip.file('_rels/.rels', relationships([['rId1', 'officeDocument', 'xl/workbook.xml']]));
  zip.file('xl/workbook.xml', XML + `<workbook xmlns="${S}" xmlns:r="${OFFICE.slice(0, -1)}"><bookViews><workbookView/></bookViews><sheets>${sheets.join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', relationships(rels));
  return finish(zip, `${h.stem(item.name)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '每页一个工作表；按文字位置提取，复杂表格需手动调整', ctx);
}
