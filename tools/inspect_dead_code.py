import re, glob, os

base_dir = r"C:\Users\ADMIN\RF_Workspace_Pro"
code_path = os.path.join(base_dir, "js", "Code.js")

with open(code_path, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Check commented out blocks
multi_comments = re.findall(r"/\*([\s\S]*?)\*/", code)
print(f"Total multi-line comments: {len(multi_comments)}")
large_comments = [c for c in multi_comments if len(c.split("\n")) > 20 and ("function " in c or "var " in c or "if (" in c)]
print(f"Large commented-out code blocks (>20 lines with code keywords): {len(large_comments)}")
for i, c in enumerate(large_comments):
    first_line = c.strip().split("\n")[0]
    print(f"  Block {i+1}: {len(c.splitlines())} lines | {first_line[:80]}")

# 2. Check all handleApiRequest cases
actions_handled = set(re.findall(r"action\s*===?\s*['\"]([^'\"]+)['\"]", code))
print(f"Total actions handled in handleApiRequest: {len(actions_handled)}")

# 3. Read other files
all_other_code = ""
for p in glob.glob(os.path.join(base_dir, "html", "*.html")):
    with open(p, "r", encoding="utf-8") as f:
        all_other_code += f.read() + "\n"

for p in glob.glob(os.path.join(base_dir, "js", "*.js")):
    if "Code.js" not in p:
        with open(p, "r", encoding="utf-8") as f:
            all_other_code += f.read() + "\n"

# 4. Check function call counts
funcs = re.findall(r"^\s*function\s+([a-zA-Z0-9_$]+)\s*\(", code, flags=re.MULTILINE)
print(f"Total top-level functions in Code.js: {len(funcs)}")

dead_candidates = []
for fn in sorted(set(funcs)):
    if fn in ["doGet", "doPost", "onOpen", "onEdit", "onInstall"]:
        continue
    # is it handled as an action?
    if fn in actions_handled or fn.replace("api_", "") in actions_handled:
        continue
    # is it called in other files?
    if re.search(r"\b" + re.escape(fn) + r"\b", all_other_code):
        continue
    # how many times does it appear in Code.js?
    matches = len(re.findall(r"\b" + re.escape(fn) + r"\b", code))
    if matches <= 1:
        dead_candidates.append(fn)

print(f"\nDead candidates (not called in frontend, other JS, or within Code.js): {len(dead_candidates)}")
for fn in dead_candidates:
    # find line number
    m = re.search(r"^\s*function\s+" + re.escape(fn) + r"\s*\(", code, flags=re.MULTILINE)
    line_no = code[:m.start()].count("\n") + 1 if m else 0
    print(f"  - {fn} (line {line_no})")

