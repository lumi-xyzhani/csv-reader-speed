// csv-reader-speed: a fast drop-in for csv-reader 1.0.0 (make.fun).
// Dependency-free ES module. run(input) returns {columns, rows, errors}
// identical to csv-reader 1.0.0's readCsv for every input.
//
// Strategy: a record whose line holds no quote is answered with one
// slice + split (its fields never need per-character work); a record
// that holds a quote is read field by field, each field found with
// indexOf jumps instead of a character loop. A quoted field is closed
// by searching for the next quote, a doubled quote ("") collapses to
// one, and CR/LF inside quotes normalise to LF. Everything else
// follows the reference policy exactly: a U+FEFF at the very start is
// dropped, a stray CR outside quotes is dropped with an error, an
// unterminated quote is a literal character and the text after it is
// read again as unquoted, junk after a closing quote is appended as it
// stands, short and long rows are padded or cut to the first record's
// width, and each error carries the 1-based line its record starts on
// (counting every LF, CRLF and lone CR inside quotes) and its record's
// index in rows (null for the header).

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE = 1;
const END = 2;
/** A CR found while scanning an unquoted field. */
const CR = 3;

/** The reading of one CSV input, {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field starting at pos, onto `value`: the next
  // comma, line break or end of text ends it, and a CR not followed by
  // LF is dropped (stray_cr). Returns the field, how it ended, and
  // `added`: the characters appended here (a caller checking for junk
  // after a closing quote needs it, since the value it passes in is
  // already there).
  function readUnquoted(value) {
    let added = 0;
    while (pos < n) {
      const comma = text.indexOf(',', pos);
      const lf = text.indexOf('\n', pos);
      const cr = text.indexOf('\r', pos);
      let m = -1;
      let kind = COMMA;
      if (comma !== -1) {
        m = comma;
        kind = COMMA;
      }
      if (lf !== -1 && (m === -1 || lf < m)) {
        m = lf;
        kind = LINE;
      }
      if (cr !== -1 && (m === -1 || cr < m)) {
        m = cr;
        kind = CR;
      }
      if (m === -1) {
        const seg = text.slice(pos);
        if (seg.length > 0) {
          value += seg;
          added += seg.length;
        }
        pos = n;
        return { value, ended: END, added };
      }
      if (kind === COMMA) {
        value += text.slice(pos, m);
        added += m - pos;
        pos = m + 1;
        return { value, ended: COMMA, added };
      }
      if (kind === LINE) {
        value += text.slice(pos, m);
        added += m - pos;
        pos = m + 1;
        line += 1;
        return { value, ended: LINE, added };
      }
      // A CR: CRLF ends the line, a lone CR is dropped with an error.
      if (text.charCodeAt(m + 1) === 10) {
        value += text.slice(pos, m);
        added += m - pos;
        pos = m + 2;
        line += 1;
        return { value, ended: LINE, added };
      }
      value += text.slice(pos, m);
      added += m - pos;
      pushError('stray_cr');
      pos = m + 1;
    }
    return { value, ended: END, added };
  }

  // Appends text[start..end) onto value, turning each CRLF or lone CR
  // inside it into one LF and counting each as one line. The closing
  // quote sits at end, so a CR at end - 1 is lone (its next character
  // is the quote, not LF).
  function appendQuoted(value, start, end) {
    let i = start;
    for (;;) {
      let r = text.indexOf('\r', i);
      if (r === -1 || r >= end) r = -1;
      let l = text.indexOf('\n', i);
      if (l === -1 || l >= end) l = -1;
      if (r === -1 && l === -1) {
        if (end > i) value += text.slice(i, end);
        return value;
      }
      let m;
      let isCR;
      if (r !== -1 && (l === -1 || r < l)) {
        m = r;
        isCR = true;
      } else {
        m = l;
        isCR = false;
      }
      if (i < m) value += text.slice(i, m);
      value += '\n';
      line += 1;
      i = m + 1;
      if (isCR && i < end && text.charCodeAt(i) === 10) i += 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let value = '';
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the
        // text after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        pushError('unterminated_quote');
        return readUnquoted('"');
      }
      value = appendQuoted(value, pos, q);
      if (text.charCodeAt(q + 1) === 34) {
        value += '"';
        pos = q + 2;
        continue;
      }
      pos = q + 1;
      break;
    }
    if (pos >= n) return { value, ended: END, added: 0 };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA, added: 0 };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE, added: 0 };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE, added: 0 };
    }
    // What follows the closing quote is appended as it stands, up to
    // the next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) pushError('quote_junk');
    return junk;
  }

  // Finishes a record: a line left with no characters is no record,
  // the header becomes columns, and every other record is padded or
  // cut to the first record's width.
  function emitRecord(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // The record's line, up to its LF (or the end of the text).
    const nl = text.indexOf('\n', pos);
    const segEnd = nl === -1 ? n : nl;
    const q = text.indexOf('"', pos);
    if (q === -1 || q >= segEnd) {
      // No quote on this line: the record ends at the LF, and its
      // fields are one split, with stray CRs dropped.
      const cr = text.indexOf('\r', pos);
      // A trailing CR before the LF is the CRLF line break, not part of
      // the last field. When the first CR on the line is that trailing
      // one, it is the only CR there, so the record is plain: no
      // per-field CR search is needed.
      if (cr === -1 || cr >= segEnd || (nl !== -1 && cr === segEnd - 1)) {
        let fields;
        if (nl !== -1 && segEnd > pos && text.charCodeAt(segEnd - 1) === 13) {
          fields = text.slice(pos, segEnd - 1).split(',');
        } else {
          fields = text.slice(pos, segEnd).split(',');
        }
        pos = nl === -1 ? n : nl + 1;
        if (nl !== -1) line += 1;
        emitRecord(fields, false);
        continue;
      }
      // Stray CRs on the line: drop each with an error, in the order
      // met (a trailing CRLF is stripped first, it is not stray).
      const crlf = nl !== -1 && segEnd > pos && text.charCodeAt(segEnd - 1) === 13;
      const fields = text.slice(pos, crlf ? segEnd - 1 : segEnd).split(',');
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        if (f.indexOf('\r') !== -1) {
          const parts = f.split('\r');
          for (let k = 0; k < parts.length - 1; k++) pushError('stray_cr');
          fields[i] = parts.join('');
        }
      }
      pos = nl === -1 ? n : nl + 1;
      if (nl !== -1) line += 1;
      emitRecord(fields, false);
      continue;
    }

    // The line holds a quote: read the record field by field.
    const fields = [];
    let field;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);
    emitRecord(fields, quoted);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
