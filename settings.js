module.exports = {
  hardhat: {},
  solcover: {},
  prettier: {
    overrides: [
      {
        files: '*.js',
        options: {
          semi: true,
          singleQuote: true,
          printWidth: 79,
          tabWidth: 2,
        },
      },
      {
        files: '*.sol',
        options: {
          printWidth: 79,
        },
      },
    ],
  },
};
