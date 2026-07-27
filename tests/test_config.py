from pathlib import Path
from ccbridge.config import Config, load_config


def test_load_config_reads_all_fields(tmp_path):
    cfg_file = tmp_path / "config.toml"
    cfg_file.write_text(
        'port = 9000\n'
        'target_lang = "正體中文"\n'
        'token = "secret"\n'
        'claude_cmd = ["claude", "-x"]\n'
        'model = "opus"\n'
        'max_chars_per_batch = 4000\n'
        'blacklist = ["bank.com"]\n',
        encoding="utf-8",
    )
    cfg = load_config(cfg_file)
    assert cfg.port == 9000
    assert cfg.token == "secret"
    assert cfg.claude_cmd == ["claude", "-x"]
    assert cfg.model == "opus"
    assert cfg.max_chars_per_batch == 4000
    assert cfg.blacklist == ["bank.com"]


def test_load_config_applies_defaults(tmp_path):
    cfg_file = tmp_path / "config.toml"
    cfg_file.write_text('token = "secret"\n', encoding="utf-8")
    cfg = load_config(cfg_file)
    assert cfg.port == 8765
    assert cfg.target_lang == "正體中文"
    assert cfg.claude_cmd == ["claude"]
    assert cfg.model is None  # 空字串 / 缺省 → None
    assert cfg.max_chars_per_batch == 6000
    assert cfg.blacklist == []


def test_load_config_empty_model_becomes_none(tmp_path):
    cfg_file = tmp_path / "config.toml"
    cfg_file.write_text('token = "s"\nmodel = ""\n', encoding="utf-8")
    cfg = load_config(cfg_file)
    assert cfg.model is None
