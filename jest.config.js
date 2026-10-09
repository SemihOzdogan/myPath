module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^@maplibre/maplibre-react-native$': '<rootDir>/__mocks__/maplibre.tsx',
    '^@react-navigation/native$': '<rootDir>/__mocks__/react-navigation-native.tsx',
    '^@react-navigation/native-stack$': '<rootDir>/__mocks__/react-navigation-native-stack.tsx',
    '^react-native-compass-heading$': '<rootDir>/__mocks__/compass-heading.ts',
    '^react-native-geolocation-service$': '<rootDir>/__mocks__/geolocation.ts',
  },
};
