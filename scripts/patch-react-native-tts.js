const fs = require('fs');
const path = require('path');

const buildFile = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-tts',
  'android',
  'build.gradle',
);
const legacyBuildscript = `buildscript {
    repositories {
        jcenter()
    }

    dependencies {
        classpath 'com.android.tools.build:gradle:1.3.1'
    }
}

`;

if (!fs.existsSync(buildFile)) process.exit(0);

const contents = fs.readFileSync(buildFile, 'utf8');
if (!contents.includes(legacyBuildscript)) process.exit(0);

// React Native owns the modern Android Gradle Plugin. Let the library inherit
// it rather than resolving its obsolete AGP 1.3.1 dependency from jcenter.
fs.writeFileSync(buildFile, contents.replace(legacyBuildscript, ''), 'utf8');
console.log('Patched react-native-tts for the current Android Gradle Plugin.');
