import { SuiClient } from '@mysten/sui/client';

const PAGE_SIZE = 50;

/**
 * Read the value of a dynamic field whose key is a marker struct
 * (e.g. `discussion::ThreadKey`), matched by the key type's suffix so it
 * keeps working across package upgrades. Returns null when the field is absent.
 */
export async function getDynamicFieldValue(
  suiClient: SuiClient,
  parentId: string,
  keyTypeSuffix: string,
): Promise<any | null> {
  let cursor: string | null | undefined = null;
  do {
    const page = await suiClient.getDynamicFields({ parentId, cursor, limit: PAGE_SIZE });
    const entry = page.data.find((field) => field.name.type.endsWith(keyTypeSuffix));
    if (entry) {
      const field = await suiClient.getDynamicFieldObject({ parentId, name: entry.name });
      const content = field.data?.content;
      if (content?.dataType !== 'moveObject') return null;
      return (content.fields as any).value ?? null;
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return null;
}
