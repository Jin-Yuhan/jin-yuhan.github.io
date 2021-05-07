ArknightsLive2D.downloadBinary = function (url, success, error) {
    var request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        if (request.status == 200) {
            success(new Uint8Array(request.response));
        } else {
            error(request.status, request.responseText);
        }
    };
    request.onerror = function () {
        error(request.status, request.responseText);
    };
    request.send();
};

function ArknightsLive2D(config) {
    this.config = config;
    this.widget = null;
    this.widgetContainer = document.getElementById("arknights-live2d");
    this.audio = this.widgetContainer.querySelector("audio");
    this.audioSrc = this.widgetContainer.querySelector("audio source");
    this.animationQueue = new Array(); // 动画播放队列
    this.triggerEvents = ["mousedown", "touchstart", "scroll"];

    this.isVoicePlaying = false;
    this.lastInteractTime = Date.now();
}

ArknightsLive2D.prototype = {
    lazyInit: function () {
        var initWrap = () => {
            this.triggerEvents.forEach(e => window.removeEventListener(e, initWrap));
            this.init();
        };
        this.triggerEvents.forEach(e => window.addEventListener(e, initWrap));
    },

    init: function () {
        let c = this.config;

        ArknightsLive2D.downloadBinary(this.getUrl(c.skeleton), data => {
            widget = document.createElement("div");
            this.widgetContainer.appendChild(widget);

            for (var prop in c.style) {
                widget.style.setProperty(prop, c.style[prop]);
            }

            this.audio.addEventListener("ended", () => this.isVoicePlaying = false);
            this.triggerEvents.forEach(e => window.addEventListener(e, this.tryPlayingIdleVoice.bind(this)));

            var skeletonJson = new spine.SkeletonJsonConverter(data, 1);
            skeletonJson.convertToJson();

            new spine.SpineWidget(widget, {
                animation: this.getAnimationList("start")[0].name,
                skin: c.skin,
                atlas: this.getUrl(c.atlas),
                jsonContent: skeletonJson.json,
                backgroundColor: "#00000000",
                loop: false,
                success: this.spineWidgetSuccessCallback.bind(this)
            });
        }, function (status, responseText) {
            console.error(`Couldn't download skeleton ${path}: status ${status}, ${responseText}.`);
        });
    },

    spineWidgetSuccessCallback: function (widget) {
        this.widget = widget;
        this.playVoice(this.getVoice("start"));

        this.widget.canvas.onclick = this.interact.bind(this);
        this.widget.state.addListener({
            complete: entry => {
                // 如果音频没播放完就一直循环指定的动画，而不是回到闲置动画
                if (this.isVoicePlaying && entry.loop) {
                    this.playAnimation({
                        name: entry.animation.name,
                        loop: true
                    });
                } else {
                    this.playAnimation(this.animationQueue.shift() || this.getAnimationList("idle"));
                }
            }
        });
    },

    interact: function () {
        if (this.isVoicePlaying || this.animationQueue.length > 0 || !this.isIdle()) {
            console.warn("互动过于频繁！");
        } else {
            this.lastInteractTime = Date.now();
            this.playAnimation(this.getAnimationList("interact"));
            this.playVoice(this.getVoice("interact"));
        }
    },

    getUrl: function (file) {
        return this.config.urlPrefix + file;
    },

    getAnimationList: function (behaviorName) {
        var behavior = this.config.behaviors[behaviorName];
        if (behaviorName == "start" || behaviorName == "idle") {
            return [{
                name: behavior.animation,
                loop: false
            }];
        }
        return behavior.animations.slice(); // 拷贝一份，防止外部修改
    },

    getVoice: function (behaviorName) {
        var behavior = this.config.behaviors[behaviorName];
        if (behaviorName == "start" || behaviorName == "idle") {
            return behavior.voice;
        }
        return behavior.voices[Math.floor(Math.random() * behavior.voices.length)];
    },

    playAnimation: function (animation) {
        if (Array.isArray(animation)) {
            this.playAnimation(animation.shift());
            animation.forEach(a => this.animationQueue.push(a)); // 加入播放队列
        } else if (animation) {
            // this.widget.setAnimation 会先重置人物的姿势，让动画切换不连贯
            this.widget.state.setAnimation(0, animation.name, animation.loop);
        }
    },

    playVoice: function (voice) {
        if (voice) {
            this.isVoicePlaying = true;
            this.audioSrc.setAttribute("src", "https://web.hycdn.cn/arknights/official/audio/20210202/1bc6d074f0ad5b1d83a04c111a66c121.mp3");
            this.audio.load();
            this.audio.play().then(null, reason => {
                this.isVoicePlaying = false;
                console.error(`无法播放音频，因为：${reason}`);
            });
        }
    },

    isIdle: function () {
        return this.widget.state.tracks[0].animation.name == this.getAnimationList("idle")[0].name;
    },

    tryPlayingIdleVoice: function () {
        var time = Date.now();
        var delta = time - this.lastInteractTime;
        var hour = Math.floor(delta / 1000 / 60 / 60);
        var minute = Math.floor(delta / 1000 / 60 - hour * 60);

        if (minute >= this.config.behaviors.idle.maxMinutes) {
            this.lastInteractTime = time;
            this.playVoice(this.getVoice("idle"));
        }
    }
};