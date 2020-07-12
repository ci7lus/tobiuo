# tobiuo

Web-Push subscribe proxy for [sea](https://github.com/rinsuki/sea)

## Motive

[Web-Push を実装した](https://github.com/rinsuki/sea/pull/48)ので端末で購読したかったが iOS ではサポートされていないので、それをサーバーサイドで受け取って Slack / Discord の Webhook に変換してしまうことにした。<br>

## Contributing

```sh
yarn
yarn dev
```

## Env

| key           | value                      |
| ------------- | -------------------------- |
| BRANCA_KEY    | トークンのエンコード用キー |
| CLIENT_ID     | sea の ClientID            |
| CLIENT_SECRET | sea の ClientSecret        |
| ENDPOINT      | sea のエンドポイント       |
| SECRET_KEY    | koa のシークレットキー     |
