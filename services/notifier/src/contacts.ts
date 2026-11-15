import { readFile } from 'node:fs/promises';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalize = (address: string) => address.trim().toLowerCase();

/** Opt-in directory of Sui addresses that want email notifications */
export class ContactDirectory {
  private readonly emails: Map<string, string>;

  constructor(entries: Record<string, string>) {
    this.emails = new Map();
    for (const [address, email] of Object.entries(entries)) {
      if (!/^0x[0-9a-fA-F]{1,64}$/.test(address.trim())) throw new Error(`Invalid Sui address in contacts: ${address}`);
      if (!EMAIL.test(email)) throw new Error(`Invalid email for ${address}`);
      this.emails.set(normalize(address), email);
    }
  }

  static async fromFile(path: string): Promise<ContactDirectory> {
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch {
      throw new Error(`Contacts file not found: ${path} (copy contacts.example.json)`);
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Contacts file must be a JSON object of address -> email');
    }
    return new ContactDirectory(parsed);
  }

  emailFor(address: string): string | undefined {
    return this.emails.get(normalize(address));
  }

  get size(): number {
    return this.emails.size;
  }
}
