"""Hybrid link/copy publishing tests (Fix 2).

The animations catalog is shared with per-video projects via hardlinks for
media (zero disk cost) while code/config/docs stay plain copies so in-place
edits can never corrupt the shared catalog.
"""
import os
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

import publish_animations as pub  # noqa: E402


def _same_inode(a: Path, b: Path) -> bool:
    sa, sb = os.stat(a), os.stat(b)
    return (sa.st_dev, sa.st_ino) == (sb.st_dev, sb.st_ino)


def _link_supported(tmp_path) -> bool:
    src = tmp_path / "probe_src"
    dst = tmp_path / "probe_dst"
    src.write_text("x", encoding="utf-8")
    try:
        os.link(src, dst)
    except (OSError, NotImplementedError, AttributeError):
        return False
    dst.unlink()
    src.unlink()
    return True


def _mk_template(root: Path) -> Path:
    t = root / "my-template"
    (t / "config").mkdir(parents=True)
    (t / "preview").mkdir()
    (t / "component.tsx").write_text("export const C = 1;\n", encoding="utf-8")
    (t / "animation.md").write_text("# doc\n", encoding="utf-8")
    (t / "config" / "defaults.json").write_text("{}", encoding="utf-8")
    (t / "config" / "schema.json").write_text("{}", encoding="utf-8")
    (t / "preview" / "preview.tsx").write_text("export const P = 1;\n", encoding="utf-8")
    (t / "preview" / "preview.mp4").write_bytes(b"\x00\x01\x02MEDIA" * 64)
    return t


def _tree_bytes(root: Path) -> dict:
    return {f.relative_to(root).as_posix(): f.read_bytes()
            for f in sorted(root.rglob("*")) if f.is_file()}


# ---------------------------------------------------------------------------
# _copy_or_link
# ---------------------------------------------------------------------------

def test_copy_or_link_copies_code_even_when_linking_works(tmp_path):
    if not _link_supported(tmp_path):
        pytest.skip("os.link unsupported on this filesystem")
    src = tmp_path / "component.tsx"
    dst = tmp_path / "out.tsx"
    src.write_text("code", encoding="utf-8")
    pub._copy_or_link(str(src), str(dst))
    assert dst.read_text(encoding="utf-8") == "code"
    assert not _same_inode(src, dst), "code/config/docs must be real copies"


@pytest.mark.parametrize("name", ["preview.mp4", "preview.png", "font.woff2", "a.bin"])
def test_copy_or_link_hardlinks_media(tmp_path, name):
    if not _link_supported(tmp_path):
        pytest.skip("os.link unsupported on this filesystem")
    src = tmp_path / name
    dst = tmp_path / f"out-{name}"
    src.write_bytes(b"media-bytes" * 32)
    pub._copy_or_link(str(src), str(dst))
    assert dst.read_bytes() == src.read_bytes()
    assert _same_inode(src, dst), "media should share the catalog inode"


def test_copy_or_link_falls_back_when_link_fails(tmp_path, monkeypatch):
    src = tmp_path / "preview.mp4"
    dst = tmp_path / "out.mp4"
    src.write_bytes(b"media-bytes")

    def _boom(*args, **kwargs):
        raise OSError("cross-device link")

    monkeypatch.setattr(os, "link", _boom)
    pub._copy_or_link(str(src), str(dst))
    assert dst.read_bytes() == b"media-bytes"
    assert not _same_inode(src, dst)


def test_copy_or_link_overwrites_existing_dst(tmp_path):
    src = tmp_path / "preview.mp4"
    dst = tmp_path / "out.mp4"
    src.write_bytes(b"new")
    dst.write_bytes(b"stale-dst")
    pub._copy_or_link(str(src), str(dst))
    assert dst.read_bytes() == b"new"
    assert src.read_bytes() == b"new", "src must never be mutated through dst"


# ---------------------------------------------------------------------------
# copy_template republish safety + barrel
# ---------------------------------------------------------------------------

def test_copy_template_republish_preserves_source(tmp_path):
    src_root = tmp_path / "catalog"
    src_root.mkdir()
    template = _mk_template(src_root)
    before = _tree_bytes(template)

    dest = tmp_path / "anim"
    dest.mkdir()
    pub.copy_template(template, dest, dry_run=False)
    first = _tree_bytes(dest / "my-template")
    # Republish over the existing tree (the migration path)
    pub.copy_template(template, dest, dry_run=False)
    second = _tree_bytes(dest / "my-template")

    assert first == second, "republish must be idempotent"
    assert _tree_bytes(template) == before, \
        "republish must never mutate the shared catalog"
    assert (dest / "my-template" / "preview" / "preview.mp4").read_bytes() == \
        before["preview/preview.mp4"]


def test_copy_template_hybrid_split(tmp_path):
    if not _link_supported(tmp_path):
        pytest.skip("os.link unsupported on this filesystem")
    src_root = tmp_path / "catalog"
    src_root.mkdir()
    template = _mk_template(src_root)
    dest = tmp_path / "anim"
    dest.mkdir()
    pub.copy_template(template, dest, dry_run=False)
    out = dest / "my-template"
    assert _same_inode(template / "preview" / "preview.mp4",
                       out / "preview" / "preview.mp4")
    assert not _same_inode(template / "component.tsx", out / "component.tsx")
    assert not _same_inode(template / "config" / "defaults.json",
                           out / "config" / "defaults.json")
    assert not _same_inode(template / "animation.md", out / "animation.md")


def test_write_barrel_index_unlinks_stale_hardlink(tmp_path):
    if not _link_supported(tmp_path):
        pytest.skip("os.link unsupported on this filesystem")
    dest = tmp_path / "anim"
    dest.mkdir()
    catalog_index = tmp_path / "catalog_index.ts"
    catalog_index.write_text("SENTINEL — shared catalog content\n", encoding="utf-8")
    # Simulate a stale hardlinked barrel landing in the published tree
    os.link(catalog_index, dest / "index.ts")

    class FakeT:
        name = "my-template"

    pub.write_barrel_index(dest, [FakeT()], dry_run=False)
    assert catalog_index.read_text(encoding="utf-8") == \
        "SENTINEL — shared catalog content\n", \
        "writing the barrel must never truncate a linked source file"
    written = (dest / "index.ts").read_text(encoding="utf-8")
    assert "MyTemplate" in written
    assert "SENTINEL" not in written


def test_barrel_export_names_for_real_catalog():
    names = [pub.components_name(p.name) for p in pub.collect_templates()]
    assert names, "expected templates in animations/"
    assert len(names) == len(set(names))
