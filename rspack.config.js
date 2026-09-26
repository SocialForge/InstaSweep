const path = require('node:path');
const { SwcJsMinimizerRspackPlugin } = require('@rspack/core');

module.exports = {
    entry: {
        background: './src/background.ts',
        dist: './src/main.tsx',
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: 'builtin:swc-loader',
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
    optimization: {
        minimize: true,
        minimizer: [
            new SwcJsMinimizerRspackPlugin({
                minimizerOptions: {
                    compress: {
                        passes: 3,
                        toplevel: true,
                        drop_debugger: true,
                    },
                    mangle: {
                        toplevel: true,
                    },
                    format: {
                        comments: false,
                    },
                },
            }),
        ],
    },
};
