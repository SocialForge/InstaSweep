const path = require('node:path');

module.exports = {
    devtool: false,
    entry: {
        background: './src/background.ts',
        dist: './src/main.tsx',
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.s[ac]ss$/i,
                use: ['style-loader', 'css-loader', 'sass-loader'],
            },
            {
                test: /\.svg$/,
                loader: 'svg-inline-loader',
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js', '.jsx'],
        alias: {
            react: 'preact/compat',
        },
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'public'),
    },
};
