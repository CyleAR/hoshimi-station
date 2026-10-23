"""One-off: compare Japanese ellipsis runs with stored translations; preview by default."""
import argparse
import csv
import re
import sqlite3
import sys
from pathlib import Path


def normalize(original, translation):
    ja, ko = re.findall(r"…+", original), re.findall(r"…+", translation)
    if not ko:
        return translation, ""
    if re.search(r"[.．。]{2,}", original + translation):
        return translation, "다른 점 표기가 섞임"
    if len(ja) != len(ko):
        return translation, "말줄임표 묶음 수가 다름"
    def positions(text):
        result = []
        for line_no, line in enumerate(text.replace("\\n", "\n").split("\n")):
            for m in re.finditer(r"…+", line):
                trim = " \t()（）「」『』\"'!?！？。、,."
                result.append((line_no, bool(line[:m.start()].strip(trim)),
                               bool(line[m.end():].strip(trim))))
        return result
    if positions(original) != positions(translation):
        return translation, "줄 또는 문장 앞·중간·끝 위치가 다름"
    lengths = [(len(run) + 1) // 2 for run in ja]
    if any(len(k) not in (len(j), n) for j, k, n in zip(ja, ko, lengths)):
        return translation, "원문 길이·변환 길이 모두와 다름"
    sizes = iter(lengths)
    return re.sub(r"…+", lambda _: "…" * next(sizes), translation), ""


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("db", type=Path, help="기존 SQLite DB 경로")
    parser.add_argument("--apply", action="store_true", help="미리보기 대신 DB 수정")
    parser.add_argument("--report", type=Path, default=Path("ellipsis-preview.csv"))
    args = parser.parse_args()
    # mode=rw/ro: a typo must never create an empty database.
    uri = args.db.resolve().as_uri() + ("?mode=rw" if args.apply else "?mode=ro")
    conn = sqlite3.connect(uri, uri=True)
    changed = skipped = 0
    try:
        conn.execute("BEGIN IMMEDIATE" if args.apply else "BEGIN")
        rows = conn.execute("SELECT unit_id, original_text, translation_text "
                            "FROM translation_units WHERE instr(translation_text, '…') > 0 "
                            "ORDER BY unit_id").fetchall()
        with args.report.open("w", encoding="utf-8-sig", newline="") as f:
            out = csv.writer(f)
            out.writerow(["판정", "항목", "원문", "수정 전", "수정 후", "보류 이유"])
            for uid, original, before in rows:
                after, reason = normalize(original, before)
                if reason:
                    skipped += 1
                    out.writerow(["보류", uid, original, before, before, reason])
                elif after != before:
                    changed += 1
                    out.writerow(["수정 대상", uid, original, before, after, ""])
                    if args.apply:
                        conn.execute("UPDATE translation_units SET translation_text=? "
                                     "WHERE unit_id=?", (after, uid))
        conn.commit() if args.apply else conn.rollback()
    finally:
        conn.close()
    print(f"{'적용' if args.apply else '미리보기'}: 수정 {changed}건, 보류 {skipped}건")
    print(f"상세 비교: {args.report.resolve()}")


if __name__ == "__main__":
    main()
