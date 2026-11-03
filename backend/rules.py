"""Pattern-based security rules for languages without a dedicated analyzer here.

These rules are line-oriented heuristics. They are deliberately conservative
(they look for dangerous APIs combined with string building or request data)
and every result is marked ``is_heuristic=True`` so the UI and AI review treat
it as "needs verification" evidence, not a confirmed vulnerability.

Python files additionally go through AST checks, Pyflakes, and Bandit; the
Python rules here only cover categories Bandit does not report (SSRF, path
traversal from request data, template injection, JWT verification, uploads).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from backend import findings as F

# Extension -> language. Languages listed here have rule coverage.
RULE_LANGUAGES: dict[str, str] = {
    ".py": "Python",
    ".pyi": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".mts": "TypeScript",
    ".cts": "TypeScript",
    ".java": "Java",
    ".go": "Go",
    ".php": "PHP",
    ".rb": "Ruby",
    ".c": "C",
    ".h": "C",
    ".cc": "C++",
    ".cpp": "C++",
    ".cxx": "C++",
    ".hpp": "C++",
    ".rs": "Rust",
    ".sh": "Shell",
    ".bash": "Shell",
    ".zsh": "Shell",
}

# Source languages we recognise but have no rules for: counted as unsupported.
UNSUPPORTED_SOURCE: dict[str, str] = {
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    ".swift": "Swift",
    ".cs": "C#",
    ".scala": "Scala",
    ".dart": "Dart",
    ".lua": "Lua",
    ".pl": "Perl",
    ".r": "R",
    ".m": "Objective-C",
    ".mm": "Objective-C++",
    ".ex": "Elixir",
    ".exs": "Elixir",
    ".erl": "Erlang",
    ".hs": "Haskell",
    ".clj": "Clojure",
    ".fs": "F#",
    ".vb": "Visual Basic",
    ".groovy": "Groovy",
    ".vue": "Vue",
    ".svelte": "Svelte",
    ".sol": "Solidity",
    ".ps1": "PowerShell",
}

CONFIG_EXTENSIONS = {
    ".yml",
    ".yaml",
    ".json",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".properties",
    ".xml",
    ".env",
    ".tf",
    ".rules",
    ".sql",
    ".gradle",
}
CONFIG_FILENAMES = {
    "dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    ".env",
    ".npmrc",
    ".pypirc",
    "firestore.rules",
    "storage.rules",
    "database.rules.json",
}


def language_for(path: str) -> str | None:
    lower = path.lower()
    for extension, language in RULE_LANGUAGES.items():
        if lower.endswith(extension):
            return language
    return None


def is_config_file(path: str) -> bool:
    name = path.rsplit("/", 1)[-1].lower()
    if name in CONFIG_FILENAMES or name.startswith(".env") or name.startswith("dockerfile"):
        return True
    return any(name.endswith(extension) for extension in CONFIG_EXTENSIONS)


def config_language(path: str) -> str:
    name = path.rsplit("/", 1)[-1].lower()
    if name.startswith("dockerfile"):
        return "Dockerfile"
    if name.endswith(".rules") or name == "database.rules.json":
        return "Firebase Rules"
    if name.startswith(".env"):
        return "Environment"
    if name.endswith(".sql"):
        return "SQL"
    if name.endswith(".tf"):
        return "Terraform"
    if name.endswith((".yml", ".yaml")):
        return "YAML"
    if name.endswith(".json"):
        return "JSON"
    return "Config"


@dataclass(frozen=True)
class Rule:
    rule_id: str
    title: str
    category: str
    severity: str
    confidence: str
    languages: frozenset[str]
    pattern: re.Pattern[str]
    description: str
    fix: str
    cwe: str | None = None
    exclude: re.Pattern[str] | None = None


def _rule(
    rule_id: str,
    title: str,
    category: str,
    severity: str,
    confidence: str,
    languages: set[str],
    pattern: str,
    description: str,
    fix: str,
    cwe: str | None = None,
    exclude: str | None = None,
    flags: int = 0,
) -> Rule:
    return Rule(
        rule_id,
        title,
        category,
        severity,
        confidence,
        frozenset(languages),
        re.compile(pattern, flags),
        description,
        fix,
        cwe,
        re.compile(exclude, flags) if exclude else None,
    )


JS = {"JavaScript", "TypeScript"}
C_FAMILY = {"C", "C++"}
REQ_JS = r"req(?:uest)?\.(?:query|body|params|headers|cookies)"
REQ_PY = r"request\.(?:args|form|values|json|files|GET|POST|data|get_json\(\))"
PHP_INPUT = r"\$_(?:GET|POST|REQUEST|COOKIE|FILES|SERVER)"

RULES: list[Rule] = [
    # ---------------- JavaScript / TypeScript ----------------
    _rule("JS-EVAL", "Use of eval()", F.CODE_INJECTION, "HIGH", "MEDIUM", JS,
          r"(?<![.\w])eval\s*\(",
          "eval() executes a string as code. If any part of the string is attacker-controlled this is remote code execution.",
          "Remove eval(). Parse data with JSON.parse or use a lookup table instead of dynamic code.", "CWE-95"),
    _rule("JS-NEW-FUNCTION", "Dynamic Function constructor", F.CODE_INJECTION, "MEDIUM", "MEDIUM", JS,
          r"\bnew\s+Function\s*\(",
          "new Function() compiles a string into code, equivalent to eval().",
          "Avoid generating code from strings; use explicit functions.", "CWE-95"),
    _rule("JS-STRING-TIMER", "setTimeout/setInterval with a string", F.CODE_INJECTION, "MEDIUM", "MEDIUM", JS,
          r"\bset(?:Timeout|Interval)\s*\(\s*[\"'`]",
          "Passing a string to setTimeout/setInterval evaluates it as code.",
          "Pass a function reference instead of a string.", "CWE-95"),
    _rule("JS-INNERHTML", "Unsafe HTML assignment", F.XSS, "MEDIUM", "MEDIUM", JS,
          r"\.(?:innerHTML|outerHTML)\s*\+?=\s*(?![\"'][^\"'`$+]*[\"']\s*;?\s*$)\S",
          "Assigning non-constant data to innerHTML/outerHTML can inject script into the page.",
          "Use textContent, or sanitize with a vetted library (e.g. DOMPurify) before inserting HTML.", "CWE-79"),
    _rule("JS-DOCUMENT-WRITE", "document.write() usage", F.XSS, "MEDIUM", "LOW", JS,
          r"\bdocument\.write(?:ln)?\s*\(",
          "document.write() with dynamic data is a common DOM XSS sink.",
          "Build DOM nodes with createElement/textContent instead.", "CWE-79"),
    _rule("JS-DANGEROUS-HTML", "dangerouslySetInnerHTML", F.XSS, "MEDIUM", "LOW", JS,
          r"dangerouslySetInnerHTML\s*=",
          "React's dangerouslySetInnerHTML bypasses escaping; unsanitized data leads to XSS.",
          "Render text normally, or sanitize the HTML with DOMPurify before passing it.", "CWE-79"),
    _rule("JS-EXEC-DYNAMIC", "Shell command built from dynamic data", F.COMMAND_INJECTION, "HIGH", "MEDIUM", JS,
          r"(?:(?<![.\w])|child_process\.|\bcp\.|childProcess\.)exec(?:Sync)?\s*\(\s*(?:`[^`]*\$\{|[\"'][^\"']*[\"']\s*\+|[A-Za-z_$][\w$.]*\s*\+)",
          "child_process.exec runs the string through a shell. Concatenated or interpolated input allows command injection.",
          "Use execFile/spawn with an argument array and validate inputs against an allow-list.", "CWE-78"),
    _rule("JS-SPAWN-SHELL", "spawn with shell: true", F.COMMAND_INJECTION, "MEDIUM", "MEDIUM", JS,
          r"\bspawn(?:Sync)?\s*\([^)]*shell\s*:\s*true",
          "spawn with shell:true re-enables shell parsing of arguments.",
          "Remove shell:true and pass arguments as an array.", "CWE-78"),
    _rule("JS-SQL-CONCAT", "SQL query built by string concatenation", F.SQL_INJECTION, "HIGH", "MEDIUM", JS,
          r"(?i)[\"'`]\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^\"'`]*\b(?:FROM|INTO|SET|WHERE)\b[^\"'`]*(?:[\"']\s*\+|\$\{)",
          "The SQL statement is built from string concatenation or template interpolation, which allows SQL injection if any part is user-controlled.",
          "Use parameterized queries / prepared statements (placeholders such as ? or $1).", "CWE-89"),
    _rule("JS-NOSQL-WHERE", "MongoDB $where operator", F.SQL_INJECTION, "MEDIUM", "LOW", JS,
          r"[\"']?\$where[\"']?\s*:",
          "$where evaluates JavaScript on the database server and is prone to NoSQL injection.",
          "Replace $where with standard query operators.", "CWE-943"),
    _rule("JS-PATH-TRAVERSAL", "File access with request data", F.PATH_TRAVERSAL, "HIGH", "MEDIUM", JS,
          rf"(?:readFile(?:Sync)?|createReadStream|writeFile(?:Sync)?|sendFile|download|unlink(?:Sync)?|path\.join)\s*\([^)]*{REQ_JS}",
          "A file path is derived from request data, which can allow ../ traversal outside the intended directory.",
          "Resolve the path and verify it stays inside an allowed base directory; prefer an allow-list of file names.", "CWE-22"),
    _rule("JS-SSRF", "Outbound request to user-supplied URL", F.SSRF, "HIGH", "MEDIUM", JS,
          rf"(?:\bfetch|axios(?:\.(?:get|post|put|patch|delete|request))?|https?\.(?:get|request)|\bgot|\brequest|needle)\s*\(\s*{REQ_JS}",
          "The server makes an HTTP request to a URL taken from the request, enabling SSRF against internal services.",
          "Validate the URL against an allow-list of hosts and block private/link-local address ranges.", "CWE-918"),
    _rule("JS-OPEN-REDIRECT", "Redirect to user-supplied URL", F.OPEN_REDIRECT, "MEDIUM", "MEDIUM", JS,
          rf"\.redirect\s*\(\s*(?:\d+\s*,\s*)?{REQ_JS}",
          "Redirecting to a URL from the request enables phishing via open redirects.",
          "Only redirect to relative paths or an allow-list of destinations.", "CWE-601"),
    _rule("JS-TLS-DISABLED", "TLS certificate verification disabled", F.TRANSPORT, "HIGH", "HIGH", JS,
          r"rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED[\"']?\s*\]?\s*=\s*[\"']?0",
          "Disabling certificate validation allows man-in-the-middle attacks.",
          "Keep certificate verification enabled; trust a private CA explicitly if needed.", "CWE-295"),
    _rule("JS-WEAK-HASH", "Weak hash algorithm", F.CRYPTO, "MEDIUM", "MEDIUM", JS,
          r"createHash\s*\(\s*[\"'](?:md5|sha1)[\"']",
          "MD5 and SHA-1 are broken for security purposes such as password hashing or signatures.",
          "Use SHA-256 or better; for passwords use bcrypt, scrypt, or Argon2.", "CWE-327"),
    _rule("JS-INSECURE-RANDOM", "Math.random() for security values", F.CRYPTO, "MEDIUM", "LOW", JS,
          r"(?i)(?:token|secret|password|nonce|salt|session|otp|key)\w*\s*[:=][^;\n]*Math\.random\s*\(",
          "Math.random() is predictable and must not generate secrets or tokens.",
          "Use crypto.randomBytes / crypto.getRandomValues / crypto.randomUUID.", "CWE-338"),
    _rule("JS-DESERIALIZE", "Unsafe deserialization library", F.DESERIALIZATION, "HIGH", "MEDIUM", JS,
          r"require\s*\(\s*[\"']node-serialize[\"']\s*\)|\bunserialize\s*\(",
          "node-serialize's unserialize() can execute attacker-supplied functions.",
          "Use JSON.parse for data exchange.", "CWE-502"),
    _rule("JS-CORS-ANY", "CORS allows any origin", F.CONFIG, "LOW", "MEDIUM", JS,
          r"Access-Control-Allow-Origin[\"']?\s*[,:]\s*[\"']\*[\"']|origin\s*:\s*[\"']\*[\"']|\bcors\s*\(\s*\)",
          "Allowing any origin lets every website call this API from a victim's browser.",
          "Restrict CORS to the exact origins that need access.", "CWE-942"),
    _rule("JS-JWT-NONE", "JWT accepts the 'none' algorithm", F.WEAK_AUTH, "HIGH", "MEDIUM", JS,
          r"algorithms\s*:\s*\[[^\]]*[\"']none[\"']",
          "Accepting alg 'none' allows forged, unsigned tokens.",
          "Pin the expected signing algorithm(s) explicitly.", "CWE-347"),
    _rule("JS-JWT-DECODE-AUTH", "JWT decoded without verification", F.WEAK_AUTH, "MEDIUM", "LOW", JS,
          r"\bjwt\.decode\s*\(",
          "jwt.decode() does not verify the signature; using its output for authorization trusts forged tokens.",
          "Use jwt.verify() with the expected key and algorithms.", "CWE-347"),

    # ---------------- Python (categories Bandit does not cover) ----------------
    _rule("PY-SSRF", "Outbound request to user-supplied URL", F.SSRF, "HIGH", "MEDIUM", {"Python"},
          rf"(?:requests|httpx|session|client)\.(?:get|post|put|patch|delete|head|request)\s*\(\s*(?:{REQ_PY}|url\s*=\s*{REQ_PY})|urlopen\s*\(\s*{REQ_PY}",
          "The server requests a URL taken from the incoming request, enabling SSRF against internal services.",
          "Validate the URL against an allow-list of hosts and block private/link-local ranges.", "CWE-918"),
    _rule("PY-PATH-TRAVERSAL", "File access with request data", F.PATH_TRAVERSAL, "HIGH", "MEDIUM", {"Python"},
          rf"\b(?:open|send_file|send_from_directory|os\.path\.join|Path)\s*\([^)]*{REQ_PY}",
          "A file path is derived from request data, which can allow ../ traversal.",
          "Use werkzeug.utils.secure_filename / safe_join and verify the resolved path stays in the base directory.", "CWE-22"),
    _rule("PY-SSTI", "Template rendered from dynamic string", F.XSS, "HIGH", "MEDIUM", {"Python"},
          r"render_template_string\s*\(\s*(?:f[\"']|[^)]*\+|[^)]*%|[^)]*\.format\(|[^)]*request\.)",
          "render_template_string with user-influenced text allows server-side template injection and XSS.",
          "Use render_template with a static template file and pass data as context variables.", "CWE-1336"),
    _rule("PY-JWT-NO-VERIFY", "JWT signature verification disabled", F.WEAK_AUTH, "HIGH", "HIGH", {"Python"},
          r"jwt\.decode\s*\([^)]*(?:verify\s*=\s*False|[\"']verify_signature[\"']\s*:\s*False)",
          "The JWT is decoded without verifying its signature, so forged tokens are accepted.",
          "Always verify signatures and pin the accepted algorithms.", "CWE-347"),
    _rule("PY-DEBUG-ENABLED", "Debug mode enabled in settings", F.CONFIG, "MEDIUM", "MEDIUM", {"Python"},
          r"^\s*DEBUG\s*=\s*True\b",
          "Debug mode exposes stack traces, settings, and sometimes interactive consoles.",
          "Read DEBUG from the environment and default it to False in production.", "CWE-489"),
    _rule("PY-UNSAFE-UPLOAD", "Uploaded file saved with client-supplied name", F.FILE_UPLOAD, "MEDIUM", "MEDIUM", {"Python"},
          r"\.save\s*\([^)]*\.filename",
          "Saving an upload under its original filename allows path traversal and overwriting files.",
          "Use secure_filename(), generate server-side names, and validate type and size.", "CWE-434",
          exclude=r"secure_filename"),
    _rule("PY-CORS-ANY", "CORS allows any origin", F.CONFIG, "LOW", "MEDIUM", {"Python"},
          r"allow_origins\s*=\s*\[\s*[\"']\*[\"']|CORS_ORIGIN_ALLOW_ALL\s*=\s*True|CORS_ALLOW_ALL_ORIGINS\s*=\s*True",
          "Allowing any origin lets every website call this API from a victim's browser.",
          "Restrict CORS to the exact origins that need access.", "CWE-942"),

    # ---------------- Java ----------------
    _rule("JAVA-SQL-CONCAT", "SQL query built by string concatenation", F.SQL_INJECTION, "HIGH", "MEDIUM", {"Java"},
          r"(?i)(?:executeQuery|executeUpdate|execute|prepareStatement|createQuery|createNativeQuery)\s*\(\s*\"[^\"]*\"\s*\+|\"\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^\"]*\"\s*\+",
          "Building SQL with string concatenation allows SQL injection.",
          "Use PreparedStatement with ? placeholders (or JPA parameters).", "CWE-89"),
    _rule("JAVA-RUNTIME-EXEC", "Runtime.exec() usage", F.COMMAND_INJECTION, "HIGH", "LOW", {"Java"},
          r"Runtime\.getRuntime\(\)\.exec\s*\(|new\s+ProcessBuilder\s*\([^)]*\+",
          "Executing OS commands with dynamic input can allow command injection.",
          "Avoid shell commands; if needed, pass a fixed argument array and validate inputs.", "CWE-78"),
    _rule("JAVA-DESERIALIZE", "Java native deserialization", F.DESERIALIZATION, "HIGH", "MEDIUM", {"Java"},
          r"new\s+ObjectInputStream\s*\(|\.readObject\s*\(\s*\)|XMLDecoder\s*\(",
          "Deserializing untrusted data with ObjectInputStream can lead to remote code execution.",
          "Use a data format such as JSON, or apply an ObjectInputFilter allow-list.", "CWE-502"),
    _rule("JAVA-WEAK-HASH", "Weak hash algorithm", F.CRYPTO, "MEDIUM", "MEDIUM", {"Java"},
          r"MessageDigest\.getInstance\s*\(\s*\"(?:MD5|MD2|SHA-?1)\"",
          "MD5/SHA-1 are not collision resistant.",
          "Use SHA-256 or better; use bcrypt/scrypt/Argon2 for passwords.", "CWE-327"),
    _rule("JAVA-WEAK-CIPHER", "Weak cipher or ECB mode", F.CRYPTO, "MEDIUM", "MEDIUM", {"Java"},
          r"Cipher\.getInstance\s*\(\s*\"(?:DES|DESede|RC4|AES)\"|Cipher\.getInstance\s*\(\s*\"[^\"]*/ECB/",
          "DES/RC4 are broken and ECB mode (the default for \"AES\") leaks plaintext patterns.",
          "Use AES/GCM/NoPadding with a random IV.", "CWE-327"),
    _rule("JAVA-XXE", "XML parser without XXE hardening", F.XXE, "MEDIUM", "LOW", {"Java"},
          r"(?:DocumentBuilderFactory|SAXParserFactory|XMLInputFactory)\.newInstance\s*\(",
          "Default Java XML parsers may resolve external entities (XXE).",
          "Disable DOCTYPE declarations and external entities on the factory.", "CWE-611"),
    _rule("JAVA-TRUST-ALL", "Hostname/certificate verification bypass", F.TRANSPORT, "HIGH", "MEDIUM", {"Java"},
          r"ALLOW_ALL_HOSTNAME_VERIFIER|NoopHostnameVerifier|setHostnameVerifier\s*\(\s*\([^)]*\)\s*->\s*true",
          "Disabling hostname verification allows man-in-the-middle attacks.",
          "Use the default hostname verifier.", "CWE-295"),

    # ---------------- Go ----------------
    _rule("GO-SQL-FORMAT", "SQL query built with formatting", F.SQL_INJECTION, "HIGH", "MEDIUM", {"Go"},
          r"\.(?:Query|QueryRow|Exec|QueryContext|QueryRowContext|ExecContext)\s*\([^)]*(?:fmt\.Sprintf|\"\s*\+)",
          "Building SQL with fmt.Sprintf or concatenation allows SQL injection.",
          "Use query placeholders ($1 / ?) and pass values as arguments.", "CWE-89"),
    _rule("GO-CMD-SHELL", "Command executed through a shell or with concatenation", F.COMMAND_INJECTION, "HIGH", "MEDIUM", {"Go"},
          r"exec\.Command(?:Context)?\s*\([^)]*\"(?:sh|bash|cmd|/bin/sh|/bin/bash|cmd\.exe)\"|exec\.Command(?:Context)?\s*\([^)]*\+",
          "Running a shell with dynamic input allows command injection.",
          "Call the program directly with a fixed argument list and validate inputs.", "CWE-78"),
    _rule("GO-TLS-SKIP", "TLS verification disabled", F.TRANSPORT, "HIGH", "HIGH", {"Go"},
          r"InsecureSkipVerify\s*:\s*true",
          "InsecureSkipVerify disables certificate validation.",
          "Remove InsecureSkipVerify; configure RootCAs for private CAs.", "CWE-295"),
    _rule("GO-WEAK-HASH", "Weak hash algorithm", F.CRYPTO, "MEDIUM", "MEDIUM", {"Go"},
          r"\b(?:md5|sha1)\.(?:New|Sum)\s*\(",
          "MD5/SHA-1 are not suitable for security purposes.",
          "Use crypto/sha256 or better; bcrypt/argon2 for passwords.", "CWE-327"),
    _rule("GO-MATH-RAND", "math/rand imported", F.CRYPTO, "LOW", "LOW", {"Go"},
          r"\"math/rand(?:/v2)?\"",
          "math/rand is predictable; it must not generate tokens, keys, or passwords.",
          "Use crypto/rand for security-sensitive randomness.", "CWE-338"),
    _rule("GO-PATH-TRAVERSAL", "File access with request data", F.PATH_TRAVERSAL, "HIGH", "MEDIUM", {"Go"},
          r"(?:os\.(?:Open|ReadFile|Create|WriteFile)|ioutil\.ReadFile|http\.ServeFile|filepath\.Join)\s*\([^)]*r\.(?:URL|FormValue|PostFormValue)",
          "A file path is derived from request data, which can allow ../ traversal.",
          "Clean the path and verify it stays within an allowed base directory.", "CWE-22"),

    # ---------------- PHP ----------------
    _rule("PHP-EVAL", "Use of eval()", F.CODE_INJECTION, "HIGH", "MEDIUM", {"PHP"},
          r"(?<![\w>])eval\s*\(",
          "eval() executes a string as PHP code.",
          "Remove eval() and use explicit logic.", "CWE-95"),
    _rule("PHP-CMD-INPUT", "OS command with request data", F.COMMAND_INJECTION, "CRITICAL", "HIGH", {"PHP"},
          rf"\b(?:system|exec|shell_exec|passthru|popen|proc_open)\s*\([^;]*{PHP_INPUT}|`[^`]*{PHP_INPUT}",
          "Request data flows directly into an OS command, allowing command injection.",
          "Avoid shell commands; if unavoidable use escapeshellarg() and strict allow-lists.", "CWE-78"),
    _rule("PHP-SQL-INPUT", "SQL query with request data", F.SQL_INJECTION, "CRITICAL", "HIGH", {"PHP"},
          rf"(?i)(?:mysql_query|mysqli_query|pg_query|->query|->exec)\s*\([^;]*{PHP_INPUT}|[\"'](?:SELECT|INSERT|UPDATE|DELETE)\b[^;]*{PHP_INPUT}",
          "Request data is placed directly into a SQL statement, allowing SQL injection.",
          "Use PDO/mysqli prepared statements with bound parameters.", "CWE-89"),
    _rule("PHP-SQL-CONCAT", "SQL query built by string concatenation", F.SQL_INJECTION, "HIGH", "MEDIUM", {"PHP"},
          r"(?i)[\"'](?:SELECT|INSERT|UPDATE|DELETE)\b[^\"']*\b(?:FROM|INTO|SET|WHERE)\b[^\"']*[\"']\s*\.\s*\$|[\"'](?:SELECT|INSERT|UPDATE|DELETE)\b[^\"']*\$[A-Za-z_]",
          "SQL is built from variables by concatenation or interpolation.",
          "Use prepared statements with bound parameters.", "CWE-89",
          exclude=PHP_INPUT),
    _rule("PHP-XSS-ECHO", "Request data echoed without encoding", F.XSS, "HIGH", "HIGH", {"PHP"},
          rf"\b(?:echo|print)\b[^;]*{PHP_INPUT}",
          "Request data is written into the response without HTML encoding.",
          "Encode output with htmlspecialchars($value, ENT_QUOTES, 'UTF-8').", "CWE-79",
          exclude=r"htmlspecialchars|htmlentities|intval|\(int\)"),
    _rule("PHP-INCLUDE-INPUT", "File include with request data", F.PATH_TRAVERSAL, "CRITICAL", "HIGH", {"PHP"},
          rf"\b(?:include|require)(?:_once)?\b[^;]*{PHP_INPUT}",
          "Including a file named by request data allows local/remote file inclusion.",
          "Map request values to a fixed allow-list of files.", "CWE-98"),
    _rule("PHP-FILE-INPUT", "File access with request data", F.PATH_TRAVERSAL, "HIGH", "MEDIUM", {"PHP"},
          rf"\b(?:file_get_contents|fopen|readfile|unlink|file_put_contents)\s*\([^;]*\$_(?:GET|POST|REQUEST|COOKIE)",
          "A file path is derived from request data, which can allow traversal or SSRF.",
          "Validate the path against an allow-list and use basename().", "CWE-22"),
    _rule("PHP-UNSERIALIZE", "unserialize() on request data", F.DESERIALIZATION, "HIGH", "HIGH", {"PHP"},
          rf"\bunserialize\s*\([^;]*{PHP_INPUT}",
          "unserialize() on attacker data enables PHP object injection.",
          "Use json_decode for untrusted data.", "CWE-502"),
    _rule("PHP-UPLOAD-NAME", "Upload stored under client filename", F.FILE_UPLOAD, "HIGH", "MEDIUM", {"PHP"},
          r"move_uploaded_file\s*\([^;]*\$_FILES\s*\[[^\]]+\]\s*\[\s*[\"']name[\"']\s*\]",
          "The upload is stored using the client-supplied filename without validation.",
          "Generate a server-side filename, validate extension/MIME type, and store outside the web root.", "CWE-434"),
    _rule("PHP-WEAK-PASSWORD-HASH", "Password hashed with MD5/SHA-1", F.WEAK_AUTH, "HIGH", "MEDIUM", {"PHP"},
          r"(?i)\b(?:md5|sha1)\s*\(\s*\$\w*(?:pass|pwd)",
          "MD5/SHA-1 password hashes are cracked quickly.",
          "Use password_hash() and password_verify().", "CWE-916"),

    # ---------------- Ruby ----------------
    _rule("RB-EVAL", "Dynamic code evaluation", F.CODE_INJECTION, "HIGH", "MEDIUM", {"Ruby"},
          r"(?<![.\w])(?:eval|instance_eval|class_eval)\s*[\(\s][^#\n]*(?:params|#\{)",
          "Evaluating strings containing request data allows code execution.",
          "Avoid eval; use explicit dispatch.", "CWE-95"),
    _rule("RB-CMD-INTERP", "Shell command with interpolation", F.COMMAND_INJECTION, "HIGH", "MEDIUM", {"Ruby"},
          r"(?:\bsystem|\bexec|%x|\bspawn|IO\.popen|Open3\.\w+)\s*\(?\s*[\"'][^\"']*#\{|`[^`]*#\{",
          "Interpolating values into a shell command allows command injection.",
          "Pass arguments separately: system('cmd', arg1, arg2).", "CWE-78"),
    _rule("RB-SQL-INTERP", "SQL fragment with interpolation", F.SQL_INJECTION, "HIGH", "MEDIUM", {"Ruby"},
          r"\.(?:where|find_by_sql|order|group|having|joins|select|execute)\s*\(\s*[\"'][^\"']*#\{",
          "Interpolating values into ActiveRecord SQL fragments allows SQL injection.",
          "Use placeholders: where('name = ?', value) or hash conditions.", "CWE-89"),
    _rule("RB-UNSAFE-LOAD", "Unsafe deserialization", F.DESERIALIZATION, "HIGH", "MEDIUM", {"Ruby"},
          r"\bMarshal\.load\s*\(|\bYAML\.load\s*\(",
          "Marshal.load / YAML.load on untrusted data can instantiate arbitrary objects.",
          "Use JSON or YAML.safe_load.", "CWE-502"),
    _rule("RB-HTML-SAFE", "Output marked HTML-safe", F.XSS, "MEDIUM", "LOW", {"Ruby"},
          r"\.html_safe\b|\braw\s*\(",
          "html_safe/raw bypasses Rails output escaping.",
          "Sanitize with sanitize() or avoid marking user data as safe.", "CWE-79"),

    # ---------------- C / C++ ----------------
    _rule("C-GETS", "Use of gets()", F.MEMORY, "CRITICAL", "HIGH", C_FAMILY,
          r"(?<![\w.>])gets\s*\(",
          "gets() cannot limit input length and always allows buffer overflow.",
          "Use fgets(buffer, sizeof buffer, stdin).", "CWE-242"),
    _rule("C-UNSAFE-STRING", "Unbounded string function", F.MEMORY, "MEDIUM", "MEDIUM", C_FAMILY,
          r"(?<![\w.>])(?:strcpy|strcat|sprintf|vsprintf|wcscpy|wcscat)\s*\(",
          "These functions do not bound the destination size and can overflow buffers.",
          "Use bounded alternatives (snprintf, strlcpy/strncpy with explicit termination).", "CWE-120"),
    _rule("C-SCANF-S", "scanf %s without width", F.MEMORY, "HIGH", "HIGH", C_FAMILY,
          r"scanf\s*\(\s*\"[^\"]*%s",
          "%s without a field width allows unbounded writes into the buffer.",
          "Specify a width (e.g. %63s) or use fgets.", "CWE-120"),
    _rule("C-FORMAT-STRING", "Non-literal format string", F.MEMORY, "HIGH", "MEDIUM", C_FAMILY,
          r"(?<![\w.>])(?:printf|syslog)\s*\(\s*[A-Za-z_]\w*\s*\)|fprintf\s*\(\s*\w+\s*,\s*[A-Za-z_]\w*\s*\)",
          "Passing a variable as the format string allows format-string attacks.",
          "Use a literal format: printf(\"%s\", value).", "CWE-134"),
    _rule("C-SYSTEM", "system()/popen() call", F.COMMAND_INJECTION, "MEDIUM", "LOW", C_FAMILY,
          r"(?<![\w.>])(?:system|popen)\s*\(",
          "system()/popen() run commands through the shell; dynamic input allows command injection.",
          "Use execve-family calls with fixed argument arrays.", "CWE-78"),

    # ---------------- Rust ----------------
    _rule("RS-SHELL-COMMAND", "Command executed through a shell", F.COMMAND_INJECTION, "MEDIUM", "MEDIUM", {"Rust"},
          r"Command::new\s*\(\s*\"(?:sh|bash|cmd|cmd\.exe|/bin/sh)\"",
          "Running a shell with dynamic arguments allows command injection.",
          "Invoke the program directly with .arg() values.", "CWE-78"),
    _rule("RS-TLS-DISABLED", "TLS verification disabled", F.TRANSPORT, "HIGH", "HIGH", {"Rust"},
          r"danger_accept_invalid_certs\s*\(\s*true\s*\)|danger_accept_invalid_hostnames\s*\(\s*true\s*\)",
          "Certificate/hostname verification is disabled.",
          "Remove the danger_* options.", "CWE-295"),
    _rule("RS-SQL-FORMAT", "SQL built with format!", F.SQL_INJECTION, "HIGH", "MEDIUM", {"Rust"},
          r"(?i)format!\s*\(\s*\"(?:SELECT|INSERT|UPDATE|DELETE)\b",
          "Building SQL with format! allows SQL injection.",
          "Use bound query parameters.", "CWE-89"),

    # ---------------- Shell ----------------
    _rule("SH-CURL-PIPE", "Remote script piped to shell", F.CONFIG, "MEDIUM", "HIGH", {"Shell", "Dockerfile"},
          r"(?:curl|wget)\b[^|\n]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b",
          "Executing a downloaded script without verification trusts the network and remote host completely.",
          "Download, verify a checksum or signature, then execute.", "CWE-494"),
    _rule("SH-CHMOD-777", "World-writable permissions", F.CONFIG, "MEDIUM", "HIGH", {"Shell", "Dockerfile"},
          r"chmod\s+(?:-R\s+)?0?777\b",
          "777 permissions let any local user modify the files.",
          "Grant the minimum permissions required.", "CWE-732"),
    _rule("SH-EVAL", "eval of variable data", F.COMMAND_INJECTION, "MEDIUM", "LOW", {"Shell"},
          r"(?<![\w-])eval\s+[^\n]*\$",
          "eval re-parses variable contents as shell code.",
          "Avoid eval; use arrays for dynamic arguments.", "CWE-78"),

    # ---------------- Config / IaC ----------------
    _rule("CFG-FIREBASE-OPEN", "Firebase rules allow public access", F.ACCESS_CONTROL, "CRITICAL", "HIGH", {"Firebase Rules"},
          r"allow\s+[\w,\s]+:\s*if\s+true\s*;|allow\s+(?:read|write|read\s*,\s*write)\s*;|[\"']\.(?:read|write)[\"']\s*:\s*(?:true|[\"']true[\"'])",
          "These Firebase security rules allow anyone, including unauthenticated users, to read or write data.",
          "Require request.auth and check ownership (request.auth.uid == userId).", "CWE-284"),
    _rule("CFG-FIREBASE-AUTH-ONLY", "Firebase rules only check sign-in", F.ACCESS_CONTROL, "HIGH", "MEDIUM", {"Firebase Rules"},
          r"allow\s+[\w,\s]+:\s*if\s+request\.auth\s*!=\s*null\s*;",
          "Any signed-in user can access these documents, including other users' data.",
          "Check ownership, e.g. request.auth.uid == resource.data.ownerId.", "CWE-639"),
    _rule("CFG-PRIVILEGED", "Privileged container", F.CONFIG, "HIGH", "HIGH", {"YAML"},
          r"^\s*privileged\s*:\s*true\b|^\s*allowPrivilegeEscalation\s*:\s*true\b",
          "Privileged containers can escape to the host.",
          "Remove privileged mode and drop capabilities.", "CWE-250"),
    _rule("CFG-DOCKER-ROOT", "Container runs as root", F.CONFIG, "LOW", "MEDIUM", {"Dockerfile"},
          r"^\s*USER\s+(?:root|0)\s*$",
          "Running the container as root increases the impact of any compromise.",
          "Create and switch to an unprivileged USER.", "CWE-250"),
    _rule("CFG-DOCKER-ADD-URL", "ADD from remote URL", F.CONFIG, "LOW", "HIGH", {"Dockerfile"},
          r"^\s*ADD\s+https?://",
          "ADD downloads remote content without integrity verification.",
          "Use curl with checksum verification, or COPY local files.", "CWE-494"),
    _rule("CFG-SQL-GRANT-ALL", "Broad database privileges", F.ACCESS_CONTROL, "MEDIUM", "MEDIUM", {"SQL"},
          r"(?i)GRANT\s+ALL\s+PRIVILEGES\s+ON\s+\*\.\*",
          "Granting all privileges on all databases violates least privilege.",
          "Grant only the privileges the application needs.", "CWE-250"),
    _rule("CFG-DEBUG-TRUE", "Debug enabled in configuration", F.CONFIG, "LOW", "LOW", {"YAML", "Environment", "Config", "JSON"},
          r"(?i)^\s*[\"']?(?:debug|app_debug|flask_debug)[\"']?\s*[:=]\s*[\"']?(?:true|1|on)[\"']?\s*,?\s*$",
          "Debug mode in deployed configuration exposes internals.",
          "Disable debug outside local development.", "CWE-489"),
]

_COMMENT_PREFIXES: dict[str, tuple[str, ...]] = {
    "Python": ("#",),
    "Shell": ("#",),
    "Ruby": ("#",),
    "YAML": ("#",),
    "Dockerfile": ("#",),
    "Environment": ("#",),
    "Config": ("#", ";"),
    "Terraform": ("#", "//"),
    "SQL": ("--",),
    "PHP": ("//", "#", "*", "/*"),
}
_DEFAULT_COMMENT = ("//", "*", "/*")
MAX_MATCHES_PER_RULE_PER_FILE = 15
MAX_LINE_LENGTH = 2000


def scan_with_rules(path: str, content: str, language: str) -> list[dict[str, Any]]:
    """Run the rules registered for ``language`` against ``content``."""
    applicable = [rule for rule in RULES if language in rule.languages]
    if not applicable:
        return []
    lines = content.splitlines()
    comment_prefixes = _COMMENT_PREFIXES.get(language, _DEFAULT_COMMENT)
    results: list[dict[str, Any]] = []
    per_rule: dict[str, int] = {}
    for index, raw_line in enumerate(lines, start=1):
        if len(raw_line) > MAX_LINE_LENGTH:
            continue
        stripped = raw_line.strip()
        if not stripped or stripped.startswith(comment_prefixes):
            continue
        for rule in applicable:
            if per_rule.get(rule.rule_id, 0) >= MAX_MATCHES_PER_RULE_PER_FILE:
                continue
            if not rule.pattern.search(raw_line):
                continue
            if rule.exclude and rule.exclude.search(raw_line):
                continue
            per_rule[rule.rule_id] = per_rule.get(rule.rule_id, 0) + 1
            results.append(
                F.make_finding(
                    source="security",
                    rule_id=rule.rule_id,
                    title=rule.title,
                    file_path=path,
                    line=index,
                    severity=rule.severity,
                    confidence=rule.confidence,
                    description=rule.description,
                    suggested_fix=rule.fix,
                    is_heuristic=True,
                    snippet=stripped,
                    context=F.line_context(lines, index),
                    language=language,
                    category=rule.category,
                    analyzer="CodeSentry rules",
                    cwe=rule.cwe,
                )
            )
    return results
