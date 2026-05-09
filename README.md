# t-search
Static GitHub Pages app for searching article titles from Qiita, Zenn, and a blog.
<br/>
https://tttol.github.io/t-search/
## Commands
```sh
npm ci
npm run dev
npm run test
npm run build
```
## Fetch data
```sh
QIITA_USER_ID=your_qiita_id ZENN_USER_ID=your_zenn_id BLOG_FEED_URL=https://example.com/feed npm run fetch
```
The fetch script writes `public/articles.json` and `public/sources.json`.
