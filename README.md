# tobiuo

Web-Push subscribe proxy for [sea](https://github.com/rinsuki/sea)

## Motive

[Web-Push を実装した](https://github.com/rinsuki/sea/pull/48)ので端末で購読したかったが iOS ではサポートされていないので、それをサーバーサイドで受け取って Slack / Discord の Webhook に変換してしまうことにした。<br>

### 主に用いているもの

-   KoaJS
-   Pug
-   TypeScript
-   Web-Push (+eec)
-   BrancaToken
-   zeit/now

## Usage

`yarn instlal && yarn start`

## Env

| key           | value                      |
| ------------- | -------------------------- |
| BRANCA_KEY    | トークンのエンコード用キー |
| CLIENT_ID     | sea の ClientID            |
| CLIENT_SECRET | sea の ClientSecret        |
| ENDPOINT      | sea のエンドポイント       |
| SECRET_KEY    | koa のシークレットキー     |
