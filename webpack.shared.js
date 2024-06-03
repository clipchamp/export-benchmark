const path = require('path');

const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
    config: {
        context: __dirname,
        entry: {
            'index':  './src/index.ts',
        },
        module: {
            rules: [
                {
                    test: /\.ts?$/,
                    use: 'ts-loader',
                    exclude: /node_modules/
                },
                {
                    test: /\.css$/,
                    use: ['style-loader', 'css-loader']
                }
            ]
        },
        resolve: {
            extensions: [ '.ts', '.js' ],
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].js'
        },
        plugins: [
            new CleanWebpackPlugin({
                verbose: true
            })
        ],
    },

    copy: [
        {
            from: '*.html',
            to: '.',
            context: 'src'
        },
    ],
}