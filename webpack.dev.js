const CopyWebpackPlugin = require('copy-webpack-plugin');
const shared = require('./webpack.shared');

module.exports = {
    ...shared.config,
    mode: 'development',
    // devtool: 'source-map',
    plugins: [
        new CopyWebpackPlugin({
            patterns: shared.copy,
        })
    ]
};
