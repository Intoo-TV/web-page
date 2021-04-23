'use strict';

const PEER_SERVER_HOST = "prod-theta-peerjs.thetatoken.org";
const PEER_SERVER_PORT = 8700;
const TRACKER_SERVER_HOST = "prod-testnet-grouping.thetatoken.org";
const TRACKER_SERVER_PORT = 8700;

const PLATFORM_THETA_WALLET_SERVICE_URL = "wss://api-wallet-service.thetatoken.org/theta/ws";

const VIDEO_ID = 'vid123';
let VIDEO_URL='';
// const VIDEO_URL = "https://bitdash-a.akamaihd.net/content/MI201109210084_1/m3u8s/f08e80da-bf1d-4e3d-8899-f0f6155f6efa.m3u8";
// --------- Guest User Helpers ------------
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const experienceID = urlParams.get('experienceID');
const authToken = urlParams.get('token');
let title = '';
let description = '';
let guestID = '';


async function getExpData() {
    let headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    };

    const options = {
        method: 'GET',
        headers: headers
    };

    let streamUrl = `https://api.intoo.tv/api/experience/${experienceID}/stream`;
    let response = await fetch(streamUrl, options);
    let responseData = await response.json();
    console.log(responseData);
    VIDEO_URL = responseData.stream.streamUrl;

    let getByIDURl = `https://api.intoo.tv/api/experience/${experienceID}`;
    response = await fetch(getByIDURl, options);
    responseData = await response.json();
    console.log(responseData);

    console.log(responseData.url);
    response = await fetch(responseData.url, {});
    responseData = await response.json();

    console.log(responseData);
    title = responseData.title;
    description = responseData.description;
};


async function fetchVaultAuthToken() {
    let headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    };

    const options = {
        method: 'GET',
        headers: headers
    };

    let url = "https://api.intoo.tv/api/user/thetaauth";
    let response = await fetch(url, options);
    let responseData = await response.json();

    return responseData.accessToken;
}

// --------- Platform Theta Wallet ------------

class PlatformThetaWalletWebSocketProvider extends Theta.WalletWebSocketProvider {
    //Override getAuth to fetch our own short TTL access token first
    async getAuth() {
        let result = await fetchVaultAuthToken();
        let accessToken = result;

        if (accessToken === null) {
            //No access token, try a non-authed call
            return {};
        }

        return {
            //WebSocketProvider uses args instead of headers
            args: {
                'access_token': accessToken
            }
        };
    }
}

// --------- Launch the App --------- 

function startVideo(theta) {
    class ClosuredThetaLoader extends Theta.HlsJsFragmentLoader {
        load(...args) {
            // Inject context from closure.
            this.thetaCtx = theta;
            super.load(...args);
        }
    }

    let hlsOpts = (theta ? { fLoader: ClosuredThetaLoader } : {});
    let videoURL = VIDEO_URL;
    let videoElement = document.getElementById('player');

    if (Hls.isSupported()) {
        let hls = new Hls(hlsOpts);
        hls.attachMedia(videoElement);

        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
            // load the stream
            hls.loadSource(videoURL);
        });

        hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
            // Start playback
            videoElement.play();
        });
    }
    else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        // hls.js is not supported on platforms that do not have Media Source
        // Extensions (MSE) enabled. When the browser has built-in HLS support
        // (check using `canPlayType`), we can provide an HLS manifest (i.e. .m3u8 URL)
        // directly to the video element throught the `src` property. This is using the
        // built-in support of the plain video element, without using hls.js.
        // Note: it would be more normal to wait on the 'canplay' event below however on
        // Safari (where you are most likely to find built-in HLS support) the video.src
        // URL must be on the user-driven. White-list before a 'canplay' event will be emitted;
        // the last video event that can be reliably listened-for when the URL is not on
        // the white-list is 'loadedmetadata'.

        // We are not using HLS.js, so Theta will not be able to use P2P!
        videoElement.src = videoURL;
        videoElement.addEventListener('loadedmetadata', function () {
            videoElement.play();
        });
    }
    else {
        // No HLS is supported...fallback...
    }
}

function startPlayer() {
    let walletProvider = new PlatformThetaWalletWebSocketProvider({
        url: PLATFORM_THETA_WALLET_SERVICE_URL,
    });
    let wallet = new Theta.Wallet({
        provider: walletProvider
    });
    console.log(wallet);
    wallet.start();

    let theta = new Theta({
        //TODO adjust params as needed depending on your HLS settings
        fragmentSize: 5000,
        failoverFactor: 0.7,
        fragmentTimeout: 3000,
        probeTimeout: 600,
        statsReportInterval: 90000,
        peerReqInterval: 120000,

        videoId: VIDEO_ID,
        userId: guestID,
        wallet: wallet,

        peerServer: {
            host: PEER_SERVER_HOST,
            port: PEER_SERVER_PORT,
            secure: true
        },
        trackerServer: {
            host: TRACKER_SERVER_HOST,
            port: TRACKER_SERVER_PORT,
            secure: true,
            path: ""
        },

        debug: true
    });

    // Event handlers
    theta.addEventListener(Theta.Events.PEERS_CHANGED, function (data) {
        // Connected peers changed
        // Data:
        // totalPeers : Integer
    });
    theta.addEventListener(Theta.Events.TRAFFIC, function (data) {
        // Bandwidth was used
        // Data:
        // type : String ('cdn', 'p2p_inbound', 'p2p_outbound')
        // stats : Object
        // stats.size : Integer - Total bytes
    });
    theta.addEventListener(Theta.Events.PAYMENT_RECEIVED, function (data) {
        // Payment received
        // Data:
        // payment : Object - info about the payment
        // payment.amount : Integer - Payment amount in GammaWei
    });
    theta.addEventListener(Theta.Events.PAYMENT_SENT, function (data) {
        // Payment sent
        // Data:
        // payment : Object - info about the payment
        // payment.amount : Integer - Payment amount in GammaWei
    });
    theta.addEventListener(Theta.Events.ACCOUNT_UPDATED, function (data) {
        // Account/waller updated
        // Data:
        // account : Object - info about the account/wallet
    });
    theta.start();

    //If you are using the Theta widget, connect the widget so it can listen to events
    theta.connectWidget();

    startVideo(theta);
}

function startApp() {
    getExpData()
        .then(() => {
            startPlayer();

            // Optional - Setup Theta Web Widgets
            var widget = new ThetaWebWidgets.OverviewWithTrafficChartWidget();
            console.log(widget);
            widget.setTheme(ThetaWebWidgets.Themes.Dark);
            widget.setMainMessage(title);
            widget.render("SAMPLE_THETA_WEB_WIDGET_PLACEHOLDER");
        });
}