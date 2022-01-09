const fs = require('fs-extra');
const download = require('download');
const chmod = require('chmod-plus');

const version = 'v1.2.5';
const gitrev = 'b913602';

let dir = 'extra/win32/x64';
if (!fs.existsSync(dir)){
    fs.ensureDirSync(dir);
}
console.log('download win32 x64 binary');
download('https://github.com/qlcchain/go-qlc/releases/download/'+version+'/gqlc-'+version+'-'+gitrev+'-windows-6.0-amd64.exe').then(data => {
    fs.writeFileSync('extra/win32/x64/gqlc.exe', data);
});

console.log('download win32 x64 test binary');
download('https://github.com/qlcchain/go-qlc/releases/download/'+version+'/gqlct-'+version+'-'+gitrev+'-windows-6.0-amd64.exe').then(data => {
    fs.writeFileSync('extra/win32/x64/gqlct.exe', data);
});

// add chmod
dir = 'extra/darwin/x64/';
if (!fs.existsSync(dir)){
    fs.ensureDirSync(dir);
}
console.log('download macOS x64 binary');
download('https://github.com/qlcchain/go-qlc/releases/download/'+version+'/gqlc-'+version+'-'+gitrev+'-darwin-10.10-amd64').then(data => {
    fs.writeFileSync('extra/darwin/x64/gqlc', data);
    chmod.file(700,'extra/darwin/x64/gqlc');
});

console.log('download macOS x64 binary test binary');
download('https://github.com/qlcchain/go-qlc/releases/download/'+version+'/gqlct-'+version+'-'+gitrev+'-darwin-10.10-amd64').then(data => {
    fs.writeFileSync('extra/darwin/x64/gqlct', data);
    chmod.file(700,'extra/darwin/x64/gqlct');
});


// add chmod
dir = 'extra/linux/x64/';
if (!fs.existsSync(dir)){
    fs.ensureDirSync(dir);
}
console.log('download linux x64 binary');
download('https://github.com/qlcchain/go-qlc/releases/download/'+version+'/gqlc-'+version+'-'+gitrev+'-linux-amd64').then(data => {
    fs.writeFileSync('extra/linux/x64/gqlc', data);
    chmod.file(700,'extra/linux/x64/gqlc');
});

console.log('download linux x64 binary test binary');
download('https://github.com/qlcchain/go-qlc/releases/download/'+version+'/gqlct-'+version+'-'+gitrev+'-linux-amd64').then(data => {
    fs.writeFileSync('extra/linux/x64/gqlct', data);
    chmod.file(700,'extra/linux/x64/gqlct');
});
