import { inflateRawSync } from "node:zlib";

type ZipEntry = {
  name: string;
  data: Buffer;
};

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

function readUInt16LE(buffer: Buffer, offset: number) {
  return buffer.readUInt16LE(offset);
}

function readUInt32LE(buffer: Buffer, offset: number) {
  return buffer.readUInt32LE(offset);
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minimumSize = 22;
  const searchStart = Math.max(0, buffer.length - 0xffff - minimumSize);

  for (let offset = buffer.length - minimumSize; offset >= searchStart; offset -= 1) {
    if (readUInt32LE(buffer, offset) === END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }

  throw new Error("Uploaded file is not a valid ZIP archive.");
}

function inflateEntryData(compressionMethod: number, compressedData: Buffer) {
  if (compressionMethod === 0) {
    return compressedData;
  }

  if (compressionMethod === 8) {
    return inflateRawSync(compressedData);
  }

  throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
}

export function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = readUInt16LE(buffer, eocdOffset + 10);
  const centralDirectoryOffset = readUInt32LE(buffer, eocdOffset + 16);

  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (readUInt32LE(buffer, offset) !== CENTRAL_DIRECTORY_FILE_HEADER) {
      throw new Error("Malformed ZIP central directory.");
    }

    const compressionMethod = readUInt16LE(buffer, offset + 10);
    const compressedSize = readUInt32LE(buffer, offset + 20);
    const fileNameLength = readUInt16LE(buffer, offset + 28);
    const extraFieldLength = readUInt16LE(buffer, offset + 30);
    const fileCommentLength = readUInt16LE(buffer, offset + 32);
    const localHeaderOffset = readUInt32LE(buffer, offset + 42);
    const fileName = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    const localHeaderNameLength = readUInt16LE(buffer, localHeaderOffset + 26);
    const localHeaderExtraLength = readUInt16LE(buffer, localHeaderOffset + 28);
    const localDataOffset = localHeaderOffset + 30 + localHeaderNameLength + localHeaderExtraLength;

    if (readUInt32LE(buffer, localHeaderOffset) !== LOCAL_FILE_HEADER) {
      throw new Error("Malformed ZIP local file header.");
    }

    const compressedData = buffer.subarray(localDataOffset, localDataOffset + compressedSize);
    entries.push({
      name: fileName,
      data: inflateEntryData(compressionMethod, compressedData),
    });

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}
