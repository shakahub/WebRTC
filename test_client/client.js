// Websocket connection
var connection = new WebSocket('ws://localhost:8888');

// Variables
var name = '',
	yourConnection, //RTCPeerConnection
	connectedUser,  //Remote User
	stream,
	offerDataChannel,
	answerDataChannel,
	files = null,
	currentFile = [],
	currentFileSize,
	currentFileMeta,
	index = 0;

connection.onopen = function () {
	console.log("Connected");
};

// Handle all messages through this callback 
connection.onmessage = function (message) {
	//console.log("Got message: ", message.data);

	try {
		var data = JSON.parse(message.data);

		switch (data.type) {
			case "login":
				onLogin(data.success);
				break;
			case "offer":
				onOffer(data.offer, data.name);
				break;
			case "answer":
				onAnswer(data.answer);
				break;
			case "candidate":
				onCandidate(data.candidate);
				break;
			case "refuse":
				onRefuse();
				break;
			case "leave":
				onLeave(false); // false means you are not the one to disconnect the peer connection
				break;
			default:
				break;
		}
	} catch (e) {
		// the message is not in JSON format
		if (message.data != 'no call connection.') {
			alert(message.data + '\r\n' + e.message);
		}
	}
};

connection.onerror = function (err) {
	console.error("Got error: ", err);
};

// Alias for sending messages in JSON format
function send(message) {
	if (connectedUser) {
		message.name = connectedUser;
	}

	console.log('Sent Message: ' + JSON.stringify(message));
	connection.send(JSON.stringify(message));
};

var loginPage = document.querySelector('#login-page'),
	callPage = document.querySelector('#call-page'),
	sharePage = document.querySelector('#share-page'),
	usernameInput = document.querySelector('#username'),
	theirUsernameInput = document.querySelector('#theirusername'),
	messageInput = document.querySelector('#message');
received = document.querySelector('#received');
statusText = document.querySelector('#status');
fileList = document.querySelector('#fileList');
loginButton = document.querySelector('#login'),
	callButton = document.querySelector('#call'),
	sendButton = document.querySelector('#send'),
	hangUpButton = document.querySelector('#hang-up'),
	shareButton = document.querySelector('#share'),
	yourVideo = document.querySelector('#yours'),
	theirVideo = document.querySelector('#theirs'),

	callPage.style.display = "none";
sharePage.style.display = "none";

// Login when the user clicks the login button
loginButton.addEventListener('click', function (event) {
	name = usernameInput.value;

	if (name.length > 0) {
		send({ type: "login", name: name });
	}
});

function onLogin(success) {
	if (success === false) {
		alert('Login unsucessful, please try a different name.');
	} else {
		loginPage.style.display = "none";
		callPage.style.display = "block";
		sharePage.style.display = "block";

		// Get the plumbing ready for a call
		startConnection();
	}
};

function startConnection() {
	if (hasUserMedia()) {
		navigator.mediaDevices.getUserMedia({ video: true, audio: false })
			.then(gotStream)
			.catch(function (e) {
				console.error('getUserMedia() error: ' + e.name);
			});
	} else {
		alert('Sorry, your browser does not support WebRTC.');
	}
};

function gotStream(myStream) {
	stream = myStream;
	yourVideo.src = window.URL.createObjectURL(stream);

	if (hasRTCPeerConnection()) {
		setupPeerConnection(stream);
	} else {
		alert("Sorry, your browser does not support WebRTC.");
	}
};

function setupPeerConnection(stream) {
	var connection_option = {
		'optional': [{ 'RtpDataChannels': true }]
	};

	var videoTracks = stream.getVideoTracks();
	//var audioTracks = stream.getAudiotracks();  //audio is false
		
	if (navigator.getUserMedia === navigator.mozGetUserMedia) {
		var configuration = {
			"urls": [{ "url": "stun:127.0.0.1:8080" }]
		};
		yourConnection = new RTCPeerConnection(configuration, connection_option);
	} else {
		var configuration = {
			"iceServers": [{ "url": "stun:127.0.0.1:8080" }]
		};
		yourConnection = new webkitRTCPeerConnection(configuration);
	}

	// Setup stream listening
	yourConnection.addStream(stream);
	yourConnection.onaddstream = function (event) {
		theirVideo.src = window.URL.createObjectURL(event.stream);
	};

	// Setup ice handling
	yourConnection.onicecandidate = function (event) {
		if (event.candidate) {
			//console.log('Send candidate to peer connection ...');
			send({ type: "candidate", candidate: event.candidate });
		}
	};
};

function setDataChannelEvents(dataChannel) {
	dataChannel.onerror = function (error) {
		console.error("Data channel error: ", error);
	};

	dataChannel.onmessage = function (event) {
		//console.log("Got data channel message:", event.data);

		try {
			var message = JSON.parse(event.data);

			switch (message.type) {
				case "instant":
					received.innerHTML += message.message + "<br />";
					received.scrollTop = received.scrollHeight;
					break;
				case "start":
					currentFile = [];
					currentFileSize = 0;
					currentFileMeta = message.file;
					console.log("file size = " + currentFileMeta.size);
					break;
				case "data":
					currentFile.push(atob(message.content));
					currentFileSize += currentFile[currentFile.length - 1].length;
					var percentage = Math.floor((currentFileSize / currentFileMeta.size) * 100);
					console.log("currentFileSize = " + currentFileSize + ", file size = " + currentFileMeta.size);
					statusText.innerHTML = "Receiving file <u>" + currentFileMeta.name + "</u> ... " + percentage + "%";
					break;
				case "end":
					saveFile(currentFileMeta, currentFile);
					break;
				case "saved":
					console.log('files.length - index = ' + (files.length - index));
					if (files.length - index > 0) {
						processFile(files[index]);
						index++;
					}
					break;
			}
		} catch (e) {
			console.error(e);
		}
	};

	dataChannel.onopen = function () {
		dataChannelSend(dataChannel, { type: 'instant', message: name + " has connected." });
		callButton.disabled = true;
		sendButton.disabled = false;
		hangUpButton.disabled = false;
		shareButton.disabled = false;
	};

	dataChannel.onclose = function () {
		console.warn('Data channel is closed.');
	};
}

function dataChannelSend(dataChannel, message) {
	dataChannel.send(JSON.stringify(message));
};

sendButton.addEventListener('click', function (event) {
	var val = messageInput.value;

	received.innerHTML += name + ": " + val + "<br />";
	received.scrollTop = received.scrollHeight;

	if (offerDataChannel != null && offerDataChannel != undefined) {
		dataChannelSend(offerDataChannel, { type: 'instant', message: name + ': ' + val });
	} else if (answerDataChannel != null && answerDataChannel != undefined) {
		dataChannelSend(answerDataChannel, { type: 'instant', message: name + ': ' + val });
	}

	messageInput.value = '';
});

function hasUserMedia() {
	navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;
	return !!navigator.getUserMedia;
};

function hasRTCPeerConnection() {
	window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
	window.RTCSessionDescription = window.RTCSessionDescription || window.webkitRTCSessionDescription || window.mozRTCSessionDescription;
	window.RTCIceCandidate = window.RTCIceCandidate || window.webkitRTCIceCandidate || window.mozRTCIceCandidate;

	return !!window.RTCPeerConnection;
};

function hasFileApi() {
	return window.File && window.FileReader && window.FileList && window.Blob;
};

// Start peer connection when the user clicks the call button
callButton.addEventListener('click', function (evnet) {
	var theirUsername = theirUsernameInput.value;

	if (theirUsername.length > 0) {
		startPeerConnection(theirUsername);
	}
});

function startPeerConnection(user) {
	var dataChannelOptions = {
		ordered: true,
		reliable: true
	};

	connectedUser = user;

	offerDataChannel = yourConnection.createDataChannel("myLabel", dataChannelOptions);
	setDataChannelEvents(offerDataChannel);

	// Begin the offer
	yourConnection.createOffer(function (offer) {
		send({ type: "offer", offer: offer });
		yourConnection.setLocalDescription(offer);
	}, function (error) {
		alert("An error has occurred.");
		connectedUser = null;
	});
};

function onOffer(offer, name) {
	connectedUser = name;

	var decision = window.confirm(connectedUser + " requests to connect with you.\r\nDo you accept it?");

	if (decision == true) {
		yourConnection.ondatachannel = function (event) {
			answerDataChannel = event.channel;
			setDataChannelEvents(answerDataChannel);
		};

		yourConnection.setRemoteDescription(new RTCSessionDescription(offer));
		yourConnection.createAnswer(function (answer) {
			send({ type: "answer", answer: answer });
			yourConnection.setLocalDescription(answer);
		}, function (error) {
			alert("An error has occurred.");
			connectedUser = null;
		});
	} else {
		send({ type: "refuse" });
	}
};

function onAnswer(answer) {
	yourConnection.setRemoteDescription(new RTCSessionDescription(answer));
};

function onCandidate(candidate) {
	//console.log('Add ICE Candidate which is from peer connection ...');
	yourConnection.addIceCandidate(new RTCIceCandidate(candidate));
};

function onRefuse() {
	alert(connectedUser + ' refused your call.');
	onLeave(false);
};

hangUpButton.addEventListener('click', function () {
	send({ type: "leave" });
	onLeave(true);
});

function onLeave(isYouHangUp) {
	if (isYouHangUp == false) {
		received.innerHTML += "The connection is closed by " + connectedUser + ".<br />";
	} else {
		received.innerHTML = "The connection is closed.<br />";
	}
	received.scrollTop = received.scrollHeight;

	callButton.disabled = false;
	sendButton.disabled = true;
	hangUpButton.disabled = true;
	shareButton.disabled = true;

	connectedUser = null;
	theirVideo.src = "";
	yourConnection.close();
	yourConnection.onicecandidate = null;
	yourConnection.onaddstream = null;
	yourConnection.ondatachannel = null;

	theirUsernameInput.value = '';
	statusText.innerHTML = '';
	fileList.innerHTML = '';

	setupPeerConnection(stream);
};

function arrayBufferToBase64(buffer) {
	var binary = '';
	var bytes = new Uint8Array(buffer);
	var len = bytes.byteLength;

	for (var i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
};

function base64ToBlob(b64Data, contentType) {
	contentType = contentType || '';

	var byteArrays = [], byteNumbers, slice;

	for (var i = 0; i < b64Data.length; i++) {
		slice = b64Data[i];

		byteNumbers = new Array(slice.length);
		for (var n = 0; n < slice.length; n++) {
			byteNumbers[n] = slice.charCodeAt(n);
		}

		var byteArray = new Uint8Array(byteNumbers);
		byteArrays.push(byteArray);
	}

	var blob = new Blob(byteArrays, { type: contentType });
	return blob;
};

function processFile(file) {
	var fileInfo = {
		name: file.name,
		type: file.type,
		size: file.size
	};

	if (offerDataChannel != null && offerDataChannel != undefined) {
		dataChannelSend(offerDataChannel, { type: "start", file: fileInfo });
	} else if (answerDataChannel != null && answerDataChannel != undefined) {
		dataChannelSend(answerDataChannel, { type: "start", file: fileInfo });
	}

	sendFile(file);
};

var CHUNK_MAX = 10240;
function sendFile(file) {
	var reader = new FileReader();

	reader.onloadend = function (event) {
		if (event.target.readyState == FileReader.DONE) {
			var buffer = reader.result,
				start = 0,
				end = 0,
				last = false;

			function sendChunk() {
				end = start + CHUNK_MAX;

				if (end > file.size) {
					end = file.size;
					last = true;
				}

				var percentage = Math.floor((end / file.size) * 100);
				statusText.innerHTML = "Sending... " + percentage + "%";

				if (offerDataChannel != null && offerDataChannel != undefined) {
					dataChannelSend(offerDataChannel, { type: "data", content: arrayBufferToBase64(buffer.slice(start, end)) });
					if (last === true) {
						dataChannelSend(offerDataChannel, { type: "end" });
					} else {
						start = end;
						// Throttle the sending to avoid flooding
						setTimeout(function () { sendChunk(); }, 100);
					}
				} else if (answerDataChannel != null && answerDataChannel != undefined) {
					dataChannelSend(answerDataChannel, { type: "data", content: arrayBufferToBase64(buffer.slice(start, end)) });
					if (last === true) {
						dataChannelSend(answerDataChannel, { type: "end" });
					} else {
						start = end;
						// Throttle the sending to avoid flooding
						setTimeout(function () { sendChunk(); }, 100);
					}
				}
			}

			sendChunk();
		}
	};

	reader.readAsArrayBuffer(file);
};

shareButton.addEventListener('click', function (event) {
	files = document.querySelector('#files').files;

	if (hasFileApi()) {
		if (files.length > 0) {
			processFile(files[0]);
			index++;
		}
	} else {
		alert('The file APIs are not fully supported in this browser.');
	}
});

function saveFile(fileInfo, data) {
	var blob = base64ToBlob(data, fileInfo.type);
	var link = document.createElement('a');

	document.body.appendChild(link);

	link.id = fileInfo.name;
	link.target = "_self";
	link.href = window.URL.createObjectURL(blob);
	link.download = fileInfo.name;

	setTimeout(function () { link.click(); }, 1000);

	//document.body.removeChild(link);
	fileList.innerHTML += fileInfo.name + " .... Done<br />";

	console.log(fileInfo.name + ' has downloaded.');

	// Inform sender the file has been saved, so that the sender can send next file.
	if (offerDataChannel != null && offerDataChannel != undefined) {
		dataChannelSend(offerDataChannel, { type: "saved" });
	} else if (answerDataChannel != null && answerDataChannel != undefined) {
		dataChannelSend(answerDataChannel, { type: "saved" });
	}
}