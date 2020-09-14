import * as crypto from 'crypto';
import * as fs from 'fs';

export function deleteFolderRecursive (path: fs.PathLike) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach(function (file, index) {
            var curPath = path + "/" + file;
            if (fs.lstatSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
};


export function md5Hash(content: string) {
    return crypto.createHash('md5').update(content).digest('hex');
}