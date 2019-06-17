import crypto from "crypto"
import { URL } from "url"
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
import branca from "branca"

const endpoint: string = process.env.ENDPOINT!
const secretKey: string = process.env.SECRET_KEY!
const clientId: string = process.env.CLIENT_ID!
const clientSecret: string = process.env.CLIENT_SECRET!
const brancaKey: string = process.env.BRANCA_KEY!
const branc = branca(brancaKey)

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

router.get("/register", async ctx => {
    if (!ctx.session.token) ctx.throw(401, "ログインしてないじゃん")
    await ctx.render("register", { account: ctx.session.account })
})

router.post("/register", body(), async ctx => {
    if (!ctx.session.token) ctx.throw(401, "ログインしてないじゃん")
    if (!ctx.request.body.uri) ctx.throw(400, "uriないけど")
    const subscriptionsReq = await Axios.get(new URL(urljoin(endpoint, "/api/v1/webpush/subscriptions")).href, {
        headers: {
            Authorization: `Bearer ${ctx.session.token}`,
        },
    })
    const uri: string = await (async () => {
        const request = ctx.request.body.uri.trim()
        if (/https\:\/\/discordapp.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9-_]+/.exec(request)) {
            const check = await Axios.get(request)
            const urig = `https://discordapp.com/api/webhooks/${check.data.id}/${check.data.token}`
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
            publicKey: vapidKeys.publicKey,
            auth: authKey,
        })
        return urljoin(ctx.origin, `/push/${branc.encode(payload)}`)
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

router.post("/push/:token", async ctx => {
    if (ctx.request.headers["content-encoding"] != "aes128gcm") ctx.throw(400, "content-encoding != aes128gcm")
    const body = await new Promise<Buffer>(resolve => ctx.req.pipe(concatStream(resolve)))
    const metadata = JSON.parse(branc.decode(ctx.params.token).toString())
    const curve = crypto.createECDH("prime256v1")
    curve.setPrivateKey(Buffer.from(metadata.privateKey, "base64"))
    const data = ece.decrypt(body, {
        version: "aes128gcm",
        privateKey: curve,
        dh: metadata.publicKey,
        authSecret: metadata.auth,
    })
    const parsed = JSON.parse(data.toString())
    switch (parsed.type) {
        case "mention":
            await Axios.post(metadata.uri, {
                content: parsed.post.text,
                username: `${parsed.post.user.name} (${parsed.post.user.screenName})`,
                avatar_url: parsed.post.user.icon,
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
