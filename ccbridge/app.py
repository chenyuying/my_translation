import subprocess
import traceback
from flask import Flask, request, jsonify

from . import translator, saver


def create_app(config, cache, runner=subprocess.run) -> Flask:
    app = Flask(__name__)

    _ALLOWED_ORIGIN_PREFIXES = ("moz-extension://", "chrome-extension://")

    @app.before_request
    def _log_request():
        """每個進來的請求都印一行，方便確認 server 到底有沒有收到資料。"""
        origin = request.headers.get("Origin")
        has_token = request.headers.get("X-CC-Token") is not None
        print(
            f"[收到請求] {request.method} {request.path} "
            f"from={request.remote_addr} Origin={origin} "
            f"帶token={has_token} 長度={request.content_length}",
            flush=True,
        )

    def check_auth():
        """回傳 (錯誤回應, 狀態碼) 或 None（通過）。"""
        origin = request.headers.get("Origin")
        if origin is not None and not origin.startswith(_ALLOWED_ORIGIN_PREFIXES):
            return jsonify({"ok": False, "error": "forbidden origin"}), 403
        if request.headers.get("X-CC-Token") != config.token:
            return jsonify({"ok": False, "error": "unauthorized"}), 401
        return None

    @app.get("/health")
    def health():
        return jsonify({"ok": True, "version": "0.1.0"})

    @app.post("/translate")
    def translate():
        err = check_auth()
        if err:
            print(f"[/translate] 認證未通過 → {err[1]}", flush=True)
            return err
        body = request.get_json(silent=True) or {}
        segments = body.get("segments", [])
        print(f"[/translate] 認證通過，收到 {len(segments)} 段，開始翻譯…", flush=True)
        try:
            result = translator.translate_page(segments, config, cache, runner=runner)
        except Exception as e:
            traceback.print_exc()  # 完整 traceback 印到終端機，方便除錯
            return jsonify({"ok": False, "error": str(e)}), 502
        return jsonify(result)

    @app.post("/save")
    def save():
        err = check_auth()
        if err:
            print(f"[/save] 認證未通過 → {err[1]}", flush=True)
            return err
        body = request.get_json(silent=True) or {}
        url = body.get("url", "")
        title = body.get("title", "")
        html = body.get("html", "")
        summary = body.get("summary", "")
        print(
            f"[/save] 認證通過，收到 title={title!r} url={url!r} "
            f"html={len(html)} 字元 summary={len(summary)} 字元",
            flush=True,
        )
        if url in config.blacklist or any(b and b in url for b in config.blacklist):
            return jsonify({"ok": False, "error": "blacklisted url"}), 403
        try:
            from datetime import date
            today = date.today().isoformat()
            slug = saver.slugify(title, today)
            clean_html = saver.sanitize_html(html, url)
            md = saver.build_md(title, url, slug, summary, today)
            md_path, html_path = saver.write_outputs(config.vault_path, slug, md, clean_html)
        except ValueError as e:
            return jsonify({"ok": False, "error": str(e)}), 400
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 500
        return jsonify({"ok": True, "md_path": str(md_path), "html_path": str(html_path)})

    return app
