import {createHash} from 'node:crypto';
// Git checkouts may use LF or CRLF for the same reviewed text. Only normalize
// that representation difference; all other bytes remain significant. Binary
// contract BOCs, original SDK pins and final bundle hashes never use this helper.
export const sourceSha256=bytes=>createHash('sha256').update(Buffer.from(bytes).toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
