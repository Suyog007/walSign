import { promises as fs } from 'fs';
import * as path from 'path';

const writeIntoPackageInfo = async (dataName: string, writeData: string) => {
    // Read the contents of packageInfo.ts
    const packageInfoPath = path.join(__dirname, './packageInfo.ts');
    let packageInfoContent = await fs.readFile(packageInfoPath, 'utf8');

    // Replace or append writeData
    const dataLine = `export const ${dataName} = '${writeData}';\n`;
    const dataRegex = new RegExp(`^export const ${dataName} = '.*';\\n`, 'm');

    if (dataRegex.test(packageInfoContent)) {
        packageInfoContent = packageInfoContent.replace(dataRegex, dataLine);
    } else {
        packageInfoContent += dataLine;
    }

    // Write the updated content back to packageInfo.ts
    await fs.writeFile(packageInfoPath, packageInfoContent);
    console.log('packageInfo.ts updated successfully with ' + dataName + '.');
};

export default writeIntoPackageInfo;