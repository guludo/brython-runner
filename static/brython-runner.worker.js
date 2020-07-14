function init(data) {
    self.window = self
    self.runType = 'code'
    self.code = ''
    self.url = ''
    self.id = data.codeName
    self.codeCwd = data.codeCwd
    self.document = {
        getElementsByTagName: getElementsByTagName,
    }
    self.staticUrl = data.staticUrl
    self.prompt = getInput
    self.hangSleep = hangSleep
    initMsgSenders()
    initMsgListeners()
    importScripts(
        self.staticUrl + '/brython/brython.js',
        self.staticUrl + '/brython/brython_stdlib.js',
    )
    var paths = [
        self.staticUrl + '/brython',
        self.staticUrl + '/brython/site-packages',
    ]
    self.__BRYTHON__.brython({
        pythonpath: paths.concat(data.paths),
        debug: 0, // 1
    })
    if (data.filePath) {
        self.__BRYTHON__.script_path = data.filePath
    }
    run('import runner.stdio; import runner.sleep;')
}

function getInput(message) {
    if (message) {
        self.stdoutWrite(message + '');
        self.stdoutFlush();
    }
    var req = new XMLHttpRequest();
    req.open('POST', '/hanger/open/', false);
    req.send('');

    if (req.status !== 200) {
        console.error('Failed to tunnel through the server to get input.');
        return '';
    }

    var key = req.responseText;

    this.postMessage({
        type: 'stdin.readline',
        value: key,
    })

    req = new XMLHttpRequest();
    req.open('POST', '/hanger/' + key + '/read/', false);
    req.send('')

    if (req.status !== 200) {
        console.error('Failed to tunnel through the server to get input.');
        return '';
    }

    return req.responseText;
}

function hangSleep(duration) {
    var req = new XMLHttpRequest();
    req.open('GET', '/hanger/sleep/?duration=' + duration, false);
    req.send(null);
}

function getElementsByTagName(tagName) {
    if (tagName === 'script') {
        if (self.runType === 'code') {
            return [{
                type: 'text/python',
                id: self.id,
                innerHTML: self.code,
            }]
        } else if (self.runType === 'url') {
            return [{
                type: 'text/python',
                id: getFilename(self.url),
                src: self.url,
            }]
        }
    }
    return []
}

function initMsgSenders() {
    self.stdoutWrite = function (data) {
        this.postMessage({
            type: 'stdout.write',
            value: data,
        })
    }
    self.stdoutFlush = function () {
        this.postMessage({
            type: 'stdout.flush',
        })
    }
    self.stderrWrite = function (data) {
        this.postMessage({
            type: 'stderr.write',
            value: data,
        })
    }
    self.stderrFlush = function () {
        this.postMessage({
            type: 'stderr.flush',
        })
    }
    self.sendMsg = function (type, value) {
        postMessage({
            type: type,
            value: value,
        })
    }
}

function initMsgListeners() {
    self.msgListeners = {}
    self.addMsgListener = function (type, callback) {
        if (!(type in self.msgListeners)) {
            self.msgListeners[type] = [callback]
        } else {
            self.msgListeners[type].push(callback)
        }
    }
    self.removeMsgListener = function (type, callback) {
        if (type in self.msgListeners) {
            var newMsgListeners = []
            for (var i = 0; i < self.msgListeners[type].length; i++) {
                if (self.msgListeners[type][i] !== callback) {
                    newMsgListeners.push(self.msgListeners[type][i])
                }
            }
            self.msgListeners[type] = newMsgListeners
        }
    }
    self.receiveMsg = function (type) {
        return new Promise(function (resolve, reject) {
            var callback = function callback(msg) {
                resolve(msg.value)
                self.removeMsgListener(type, callback)
            }
            self.addMsgListener(type, callback)
        })
    }
}

function getFilename(url) {
    var splitUrl = url.split('/')
    return splitUrl[splitUrl.length - 1]
}

function getParentUrl(url) {
    var splitUrl = url.split('/')
    if (splitUrl.length === 1) {
        return './'
    } else {
        return splitUrl.slice(0, splitUrl.length - 1).join('/')
    }
}

function run(src) {
    self.runType = 'code'
    self.code = src
    var pathBackup = self.__BRYTHON__.script_path
    self.__BRYTHON__.script_path = self.codeCwd
    self.__BRYTHON__.parser._run_scripts({})
    self.__BRYTHON__.script_path = pathBackup
}

function runUrl(url) {
    self.runType = 'url'
    self.url = url
    var pathBackup = self.__BRYTHON__.script_path
    self.__BRYTHON__.script_path = getParentUrl(url)
    self.__BRYTHON__.parser._run_scripts({})
    self.__BRYTHON__.script_path = pathBackup
}

function done(exit) {
    postMessage({
        type: 'done',
        exit,
    })
}

onmessage = function (message) {
    data = message.data
    switch (data.type) {
        case 'init':
            init(data)
            break
        case 'run.code':
            try {
                run(data.code)
                done(0)
            } catch (err) {
                done(1)
            }
            break
        case 'run.url':
            try {
                runUrl(data.url)
                done(0)
            } catch (err) {
                done(1)
            }
            break
        default:
            break
    }
    if (data.type in self.msgListeners) {
        for (var i = 0; i < self.msgListeners[data.type].length; i++) {
            self.msgListeners[data.type][i](data)
        }
    }
}