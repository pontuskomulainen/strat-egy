// FNV-1a 32-bit — a non-cryptographic hash over raw bytes, used to detect
// simulation desyncs. Pure integer ops only (Math.imul, >>>); see CLAUDE.md's
// determinism rules: "Banned in src/sim/**".

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a 32-bit hash over the bytes of an ArrayBuffer (or a view's backing bytes). */
export function fnv1a32(buffer: ArrayBufferLike | ArrayBufferView): number {
  const bytes =
    ArrayBuffer.isView(buffer)
      ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : new Uint8Array(buffer);

  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash ^ bytes[i]) >>> 0;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash;
}

/**
 * A tree of named sub-hashes for one tick. "Hash differs" is a useless signal;
 * this lets a desync report say which subsystem diverged first.
 */
export interface HashTree {
  readonly global: number;
  readonly territory: number;
  readonly economy: number;
  readonly units: number;
  readonly rngCursor: number;
}
