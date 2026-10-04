// The words a shell would EXECUTE, with the data around them blanked out.
//
// The guardrail's command rules are about what a command does. Before 2.6.0 they ran over every
// character of a tool call, so a runbook written through a heredoc, a commit message, a migration
// file or a PR body that merely NAMED a dangerous command was refused like the command itself.
// executableText() keeps the text a shell runs and replaces the text it only carries — the body of a
// heredoc that feeds `cat`, a quoted argument of `git commit`, a comment — with underscores, byte for
// byte, so offsets and line breaks stay where they were.
//
// Quoted text and heredoc bodies stay when the segment hands them to something that runs them:
// `bash -c "…"`, `node -e "…"`, `eval`, `ssh host "…"`, a SQL client, or `bash <<EOF`. Command
// substitutions inside double quotes (`$(…)`, backticks) are always kept. This is a speed bump, not a
// shell parser: an unusual construct falls on the side of keeping the text, which is the old behavior.

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'csh', 'tcsh', 'fish', 'ash']);
const INTERPRETERS = new Set(['node', 'nodejs', 'python', 'python2', 'python3', 'perl', 'ruby', 'php', 'deno', 'bun', 'lua', 'pwsh', 'powershell', 'osascript', 'tsx', 'ts-node']);
const SQL_CLIENTS = new Set(['psql', 'mysql', 'mariadb', 'sqlite3', 'sqlcmd', 'sqlplus', 'duckdb', 'clickhouse-client', 'mongosh', 'cqlsh', 'usql']);
const RUNS_ITS_ARGUMENT = new Set(['eval', 'ssh']);
const EVAL_FLAG = /^(?:-[A-Za-z]*[ce]|--eval|--command|-Command)$/;
const WHITESPACE = /\s/;
const SEPARATORS = new Set([';', '&', '|', '(', ')']);

const baseName = (word) => word.replace(/^.*[\\/]/, '');

/** Does a segment's words hand its quoted text and heredoc bodies to something that runs them? */
function runsItsText(words, fedByHeredoc) {
  for (let i = 0; i < words.length; i += 1) {
    const w = baseName(words[i]);
    if (RUNS_ITS_ARGUMENT.has(w) || SQL_CLIENTS.has(w)) return true;
    if (SHELLS.has(w) || INTERPRETERS.has(w)) {
      if (fedByHeredoc || words.slice(i + 1).some((x) => EVAL_FLAG.test(x))) return true;
    }
  }
  return false;
}

/** `<<`, `<<-`, `<<'EOF'`, `<<"EOF"` — but not `<<<` and not arithmetic such as `$((1<<2))`. */
const HEREDOC = /^<<(-?)[ \t]*(?:'([A-Za-z_][\w-]*)'|"([A-Za-z_][\w-]*)"|\\?([A-Za-z_][\w-]*))/;

/** Index just past the end of a `$(…)` that starts at `open` (the index of `$`), or -1. */
function endOfSubstitution(text, open) {
  let depth = 0;
  for (let i = open + 1; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') { depth -= 1; if (depth === 0) return i + 1; }
  }
  return -1;
}

/**
 * @param {string} command
 * @returns {string} the command with data blanked out; same length, same line breaks
 */
export function executableText(command) {
  const text = String(command);
  const n = text.length;
  const blank = new Uint8Array(n);
  const blankRange = (from, to) => { for (let k = from; k < to; k += 1) blank[k] = 1; };

  let words = [];
  let word = '';
  let quoted = [];
  let fedByHeredoc = false;
  let lineRuns = false;
  let lineInterpreter = false;
  let heredocs = [];

  const endWord = () => { if (word) { words.push(word); word = ''; } };
  const endSegment = () => {
    endWord();
    if (words.some((w) => SHELLS.has(baseName(w)) || INTERPRETERS.has(baseName(w)))) lineInterpreter = true;
    if (runsItsText(words, fedByHeredoc)) lineRuns = true;
    else for (const ranges of quoted) for (const [a, b] of ranges) blankRange(a, b);
    words = []; quoted = []; fedByHeredoc = false;
  };

  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '\\') {
      if (text[i + 1] === '\n' || (text[i + 1] === '\r' && text[i + 2] === '\n')) endWord();
      else word += c + (text[i + 1] ?? '');
      i += text[i + 1] === '\r' && text[i + 2] === '\n' ? 3 : 2;
      continue;
    }
    if (c === "'") {
      const close = text.indexOf("'", i + 1);
      const end = close === -1 ? n : close;
      if (WHITESPACE.test(text.slice(i + 1, end))) quoted.push([[i + 1, end]]);
      word += '_';
      i = close === -1 ? n : close + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      const keep = [];
      while (j < n && text[j] !== '"') {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === '$' && text[j + 1] === '(') {
          const end = endOfSubstitution(text, j);
          if (end === -1) break;
          keep.push([j, end]);
          j = end;
          continue;
        }
        if (text[j] === '`') {
          const end = text.indexOf('`', j + 1);
          if (end === -1) break;
          keep.push([j, end + 1]);
          j = end + 1;
          continue;
        }
        j += 1;
      }
      const end = Math.min(j, n);
      if (WHITESPACE.test(text.slice(i + 1, end))) {
        const ranges = [];
        let from = i + 1;
        for (const [a, b] of keep) { if (a > from) ranges.push([from, a]); from = b; }
        if (end > from) ranges.push([from, end]);
        quoted.push(ranges);
      }
      word += '_';
      i = Math.min(end + 1, n);
      continue;
    }
    if (c === '#' && !word && (i === 0 || /[\s;&|(]/.test(text[i - 1]))) {
      let end = text.indexOf('\n', i);
      if (end === -1) end = n;
      blankRange(i, end);
      i = end;
      continue;
    }
    if (c === '<' && text[i + 1] === '<') {
      if (text[i + 2] === '<') { fedByHeredoc = true; endWord(); i += 3; continue; }
      const m = HEREDOC.exec(text.slice(i, i + 80));
      if (m) {
        heredocs.push({ dash: m[1] === '-', delim: m[2] || m[3] || m[4] });
        fedByHeredoc = true;
        endWord();
        i += m[0].length;
        continue;
      }
    }
    if (c === '\n') {
      endSegment();
      i += 1;
      for (const { dash, delim } of heredocs) {
        const bodyStart = i;
        let at = i;
        while (at < n) {
          let eol = text.indexOf('\n', at);
          if (eol === -1) eol = n;
          const line = text.slice(at, eol).replace(/\r$/, '');
          if ((dash ? line.replace(/^\t+/, '') : line) === delim) break;
          at = eol + 1;
        }
        // `cat <<EOF | sh` feeds the body to a shell on the same line, so any interpreter there keeps it
        if (!lineRuns && !lineInterpreter) blankRange(bodyStart, Math.min(at, n));
        i = Math.min(at, n);
      }
      heredocs = [];
      lineRuns = false;
      lineInterpreter = false;
      continue;
    }
    if (SEPARATORS.has(c)) { endSegment(); i += 1; continue; }
    if (WHITESPACE.test(c)) { endWord(); i += 1; continue; }
    word += c;
    i += 1;
  }
  endSegment();

  let out = '';
  for (let k = 0; k < n; k += 1) out += blank[k] && text[k] !== '\n' && text[k] !== '\r' ? '_' : text[k];
  return out;
}
