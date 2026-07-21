export class BitWriter {
  private bytes: number[] = [];
  private currentByte = 0;
  private bitPos = 0;

  writeBits(value: number, bits: number) {
    let v = value;
    for (let i = bits - 1; i >= 0; i--) {
      const bit = (v >>> i) & 1;
      this.currentByte = (this.currentByte << 1) | bit;
      this.bitPos++;
      if (this.bitPos === 8) {
        this.bytes.push(this.currentByte & 0xFF);
        this.currentByte = 0;
        this.bitPos = 0;
      }
    }
  }

  writeUint8(v: number) { this.writeBits(v & 0xFF, 8); }
  writeUint16(v: number) { this.writeBits(v & 0xFFFF, 16); }
  writeUint24(v: number) { this.writeBits(v & 0xFFFFFF, 24); }
  writeUint32(v: number) { this.writeBits(v >>> 0, 32); }

  writeInt8(v: number) { this.writeBits(v & 0xFF, 8); }
  writeInt16(v: number) { this.writeBits(v & 0xFFFF, 16); }
  writeInt24(v: number) { this.writeBits(v & 0xFFFFFF, 24); }
  writeInt32(v: number) { this.writeBits(v >>> 0, 32); }

  writeSignedInt(v: number, bits: number) {
    let val = v;
    if (val < 0) val = val + (1 << bits);
    this.writeBits(val & ((1 << bits) - 1), bits);
  }

  writeUtf8Like(n: number) {
    if (n < 0x80) {
      this.writeBits(n, 8);
    } else if (n < 0x400) {
      this.writeBits(0xC0 | (n >> 6), 8);
      this.writeBits(0x80 | (n & 0x3F), 8);
    } else if (n < 0x20000) {
      this.writeBits(0xE0 | (n >> 12), 8);
      this.writeBits(0x80 | ((n >> 6) & 0x3F), 8);
      this.writeBits(0x80 | (n & 0x3F), 8);
    } else if (n < 0x1000000) {
      this.writeBits(0xF0 | (n >> 18), 8);
      this.writeBits(0x80 | ((n >> 12) & 0x3F), 8);
      this.writeBits(0x80 | ((n >> 6) & 0x3F), 8);
      this.writeBits(0x80 | (n & 0x3F), 8);
    } else if (n < 0x2000000) {
      this.writeBits(0xF8 | (n >> 24), 8);
      this.writeBits(0x80 | ((n >> 18) & 0x3F), 8);
      this.writeBits(0x80 | ((n >> 12) & 0x3F), 8);
      this.writeBits(0x80 | ((n >> 6) & 0x3F), 8);
      this.writeBits(0x80 | (n & 0x3F), 8);
    } else if (n < 0x40000000) {
      this.writeBits(0xFC | (n >> 30), 8);
      this.writeBits(0x80 | ((n >> 24) & 0x3F), 8);
      this.writeBits(0x80 | ((n >> 18) & 0x3F), 8);
      this.writeBits(0x80 | ((n >> 12) & 0x3F), 8);
      this.writeBits(0x80 | ((n >> 6) & 0x3F), 8);
      this.writeBits(0x80 | (n & 0x3F), 8);
    } else {
      this.writeBits(0xFE, 8);
      this.writeBits(0x80 | ((n >> 30) & 0x3F), 8);
      this.writeBits(0x80 | ((n >> 24) & 0x3F), 8);
      this.writeBits(0x80 | ((n >> 18) & 0x3F), 8);
      this.writeBits(0x80 | ((n >> 12) & 0x3F), 8);
      this.writeBits(0x80 | ((n >> 6) & 0x3F), 8);
      this.writeBits(0x80 | (n & 0x3F), 8);
    }
  }

  alignByte() {
    if (this.bitPos > 0) {
      this.currentByte <<= (8 - this.bitPos);
      this.bytes.push(this.currentByte & 0xFF);
      this.currentByte = 0;
      this.bitPos = 0;
    }
  }

  getBytes(): Uint8Array {
    if (this.bitPos === 0) return new Uint8Array(this.bytes);
    const out = new Uint8Array(this.bytes.length + 1);
    for (let i = 0; i < this.bytes.length; i++) out[i] = this.bytes[i];
    out[this.bytes.length] = (this.currentByte << (8 - this.bitPos)) & 0xFF;
    return out;
  }

  getArrayBuffer(): ArrayBuffer {
    return this.getBytes().buffer as ArrayBuffer;
  }

  length(): number {
    return this.bytes.length + (this.bitPos > 0 ? 1 : 0);
  }
}
