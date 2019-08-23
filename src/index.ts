import crypto from "crypto"
import { URL } from "url"
import $ from "transform-ts"
import Koa from "koa"
import body from "koa-body"
import Router from "koa-router"
import views from "koa-views"
import session from "koa-session"
import urljoin from "url-join"
import Axios from "axios"
import webpush from "web-push"
import concatStream from "concat-stream"
// @ts-ignore
import ece from "http_ece"
// @ts-ignore
import Branca from "branca"

const endpoint = $.string.transformOrThrow(process.env.ENDPOINT)
const secretKey = $.string.transformOrThrow(process.env.SECRET_KEY)
const clientId = $.string.transformOrThrow(process.env.CLIENT_ID)
const clientSecret = $.string.transformOrThrow(process.env.CLIENT_SECRET)
const brancaKey = $.string.transformOrThrow(process.env.BRANCA_KEY)
const branca = Branca(brancaKey)

const app = new Koa()
const router = new Router<any, any>()
app.keys = [secretKey]
app.use(session({ key: "tobiuo:session" }, app))
app.use(views(`${__dirname}/views`, { extension: "pug" })).use(router.routes())

router.get("/", async ctx => {
    if (ctx.session.token) {
        const subscriptionsReq = await Axios.get(new URL(urljoin(endpoint, "/api/v1/webpush/subscriptions")).href, {
            headers: {
                Authorization: `Bearer ${ctx.session.token}`,
            },
        })
        ctx.state.subscriptions = subscriptionsReq.data
    }
    await ctx.render("index", { account: ctx.session.account, subscriptions: ctx.state.subscriptions })
})

router.get("/user/logout", async ctx => {
    if (ctx.session.token) {
        ctx.session.token = null
        ctx.session.account = null
        await ctx.redirect("/")
    } else {
        ctx.throw(400, "session ないやん")
    }
})

router.get("/user/login", async ctx => {
    if (ctx.session.token) {
        ctx.session.token = null
        ctx.session.account = null
    }
    if (ctx.query.code && ctx.query.state) {
        const code = ctx.query.code
        const state = ctx.query.state
        const tokenURI = new URL(urljoin(endpoint, "/oauth/token"))
        const params = {
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            state: state,
            grant_type: "authorization_code",
        }
        const tokenReq = await Axios.post(tokenURI.href, params, {
            headers: { "Content-Type": "application/json" },
        })
        ctx.session.token = tokenReq.data.access_token
        ctx.session.tokenType = tokenReq.data.token_type
        const account = await Axios.get(new URL(urljoin(endpoint, "/api/v1/account")).href, {
            headers: {
                Authorization: `Bearer ${ctx.session.token}`,
            },
        })
        ctx.session.account = account.data
        await ctx.redirect(state)
    } else {
        const authorizeURI = new URL(urljoin(endpoint, "/oauth/authorize"))
        authorizeURI.searchParams.set("state", "/")
        authorizeURI.searchParams.set("client_id", clientId)
        authorizeURI.searchParams.set("response_type", "code")
        await ctx.redirect(authorizeURI.href)
    }
})

router.post("/", body(), async ctx => {
    if (!ctx.session.token) ctx.throw(401, "ログインしてないじゃん")
    if (!ctx.request.body.uri) ctx.throw(400, "uriないけど")
    const subscriptionsReq = await Axios.get(new URL(urljoin(endpoint, "/api/v1/webpush/subscriptions")).href, {
        headers: {
            Authorization: `Bearer ${ctx.session.token}`,
        },
    })
    const uri: string = await (async () => {
        const request = ctx.request.body.uri.trim()
        let exc
        if ((exc = /https\:\/\/discordapp.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9-_]+/.exec(request))) {
            const check = await Axios.get(exc[0])
            const urig = `https://discordapp.com/api/webhooks/${check.data.id}/${check.data.token}/slack`
            if (subscriptionsReq.data.filter((subscription: any) => subscription.description == urig).length)
                return ctx.throw(400, "既に登録済みっぽい")
            return urig
        } else if ((exc = /https\:\/\/hooks.slack.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+/.exec(request))) {
            const urig = exc[0]
            const check = await Axios.post(urig, { text: "Hello, world." })
            if (subscriptionsReq.data.filter((subscription: any) => subscription.description == urig).length)
                return ctx.throw(400, "既に登録済みっぽい")
            return urig
        } else {
            return ctx.throw(400, "uriがおかしい")
        }
    })()
    const vapidKeys = webpush.generateVAPIDKeys() // 鍵セット
    const authKey = crypto.randomBytes(11).toString("hex") // 乱数
    const subscribeUri: string = await (async () => {
        const payload = JSON.stringify({
            uri: uri,
            privateKey: vapidKeys.privateKey,
            auth: authKey,
        })
        return urljoin(ctx.origin, `/push/${branca.encode(payload)}`)
    })()
    const payload = {
        endpoint: subscribeUri,
        keys: {
            auth: authKey,
            p256dh: vapidKeys.publicKey,
        },
        description: uri,
    }
    await Axios.post(new URL(urljoin(endpoint, "/api/v1/webpush/subscriptions")).href, JSON.stringify(payload), {
        headers: {
            Authorization: `Bearer ${ctx.session.token}`,
            "Content-Type": "application/json",
        },
    })
    await ctx.redirect("/")
})

router.get("/:id", async ctx => {
    if (!ctx.session.token) ctx.throw(401, "ログインしてないじゃん")
    const id = parseInt(ctx.params.id)
    if (isNaN(id)) ctx.throw(400, "不正")
    const subscriptionsReq = await Axios.get(new URL(urljoin(endpoint, "/api/v1/webpush/subscriptions")).href, {
        headers: {
            Authorization: `Bearer ${ctx.session.token}`,
        },
    })
    const subscriptionFil = subscriptionsReq.data.filter((subscription: any) => subscription.id == id)
    if (!subscriptionFil.length) {
        ctx.throw(404, "みつかりませんでした。")
    }
    const subscription = subscriptionFil[0]
    if (ctx.query.delete == "1") {
        await Axios.delete(new URL(urljoin(endpoint, `/api/v1/webpush/subscriptions/${id}`)).href, {
            headers: {
                Authorization: `Bearer ${ctx.session.token}`,
            },
        })
        ctx.status = 204
        ctx.redirect("/")
    } else {
        await ctx.render("show", { account: ctx.session.account, subscription: subscription })
    }
})

router.post("/push/:token", async ctx => {
    if (ctx.request.headers["content-encoding"] != "aes128gcm") ctx.throw(400, "content-encoding != aes128gcm")
    const body = await new Promise<Buffer>(resolve => ctx.req.pipe(concatStream(resolve)))
    const metadata = JSON.parse(branca.decode(ctx.params.token).toString())
    const curve = crypto.createECDH("prime256v1")
    curve.setPrivateKey(Buffer.from(metadata.privateKey, "base64"))
    const publicKey = curve.getPublicKey().toString("base64")
    const data = ece.decrypt(body, {
        version: "aes128gcm",
        privateKey: curve,
        dh: publicKey,
        authSecret: metadata.auth,
    })
    const parsed = JSON.parse(data.toString())
    switch (parsed.type) {
        case "mention":
            await Axios.post(metadata.uri, {
                icon_url: parsed.post.user.icon,
                username: `${parsed.post.user.screenName} `,
                fallback: parsed.post.text,
                attachments: [
                    {
                        author_name: parsed.post.user.name,
                        author_icon: parsed.post.user.icon,
                        text: parsed.post.text,
                        footer: `via ${parsed.post.application.name}`,
                    },
                ],
            })
            break
    }
    ctx.status = 204
})

async function run() {
    const port = process.env.PORT || 5000
    app.listen(port)
    console.log(`started on http://localhost:${port}`)
}

if (!process.env.IS_NOW) {
    run()
}

export default app.callback()
