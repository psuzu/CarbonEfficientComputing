"""Tiny placeholder training script for upload simulation."""

from __future__ import annotations


def main() -> None:
    epochs = 5
    for epoch in range(1, epochs + 1):
        print(f"epoch={epoch} loss={1 / epoch:.4f}")


if __name__ == "__main__":
    main()
