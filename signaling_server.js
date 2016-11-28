var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({ port: 8888 });
var users = {};

wss.on('listening', function () {
	console.log("Server started and listening client connection now ...");
});

wss.on('connection', function (connectHandler) {
	console.log('A user connected');

	connectHandler.on('message', function (message) {
		var data = {};

		if (message)
			data = JSON.parse(message);

		eventHandler(this, data.type, data);
	});

	connectHandler.on('close', function () {
		eventHandler(this, 'close');
	});
});

//START EVENTHANDLER
var eventHandler = function (connection, currentEvent, data) {
	switch (currentEvent) {
		case 'login':
			onLogin(connection, data);
			break;
		case "offer": // user A (connection.name) sends an offer to user B (data.name) (exp: request for a talk)
			onOffer(connection, data);
			break;
		case "answer":  // user B (connection.name) replys to user A (data.name) (exp: agree to talk)
			onAnswer(connection, data);
			break;
		case "candidate": // handle ICE candidates since call has been established between 2 users
			onCandidate(connection, data);
			break;
		case "refuse":
			onRefuse(connection, data);
			break;
		case "leave":
			onLeave(connection);
			break;
		case 'close':
			onClose(connection);
			break;
		default:
			sendTo(connection, { type: 'error', message: 'Unrecognized event: ' + currentEvent });
			break;
	}
};
//END EVENTHANDLER

//START LOGIN
var onLogin = function (connection, user) {
	console.log('User ' + user.name + ' logged in');
	// if user has logged in already...
	if (users[user.name]) {
		sendTo(connection, { type: 'login', success: false });
	} else {
		// It is a new logged in user
		users[user.name] = connection;
		connection.name = user.name;

		sendTo(connection, { type: 'login', success: true });
	}
};
//END LOGIN

//START OFFER
var onOffer = function (connection, user) {
	var currentUser = connection.name;

	if (users[currentUser]) {
		console.log('Sending offer to ', user.name);
		var conn = users[user.name];  // conn ID is user B's connection

		if (conn) {
			connection.otherName = user.name;
			sendTo(conn, { type: 'offer', offer: user.offer, name: currentUser });
		} else
			connection.send(user.name + ' is not avaliable.');
	} else
		connection.send('Please login first.');
};
//END OFFER

//START ANSWER
var onAnswer = function (connection, user) {
	var currentUser = connection.name;

	if (users[currentUser]) {
		console.log('Sending answer to ', user.name);
		var conn = users[user.name];  // conn ID is user A's connection

		if (conn) {
			connection.otherName = user.name;
			sendTo(conn, { type: 'answer', answer: user.answer });
		} else
			connection.send(user.name + ' is not avaliable.');
	} else
		connection.send("Please login first.");
};
//END ANSWER

//START CANDIDATE
var onCandidate = function (connection, user) {
	var currentUser = connection.name;

	if (users[currentUser]) {
		var conn = users[connection.otherName];

		if (conn) {
			console.log('Sending candidate to ', connection.otherName);
			sendTo(conn, { type: "candidate", candidate: user.candidate });
		} else
			connection.send('no call connection.');
	} else
		connection.send('Please login first.');
};
//END CANDIDATE

//START REFUSE
var onRefuse = function (connection, user) {
	var currentUser = connection.name;

	if (users[currentUser]) {
		console.log('Sending refuse message to ', user.name);
		var conn = users[user.name];

		connection.otherName = null;

		if (conn)
			sendTo(conn, { type: "refuse" });
	}
};
//END REFUSE

//START LEAVE
var onLeave = function (connection) {
	console.log('Disconnecting ' + connection.name + ' from ', connection.otherName);
	var conn = users[connection.otherName];

	connection.otherName = null;

	if (conn)
		sendTo(conn, { type: "leave" });
};
//END LEAVE

//START CLOSE EVENT
var onClose = function (connection) {
	if (connection.name) {
		console.log(connection.name + " logged out.");
		delete users[connection.name];

		if (connection.otherName) {
			console.log('Disconnecting ' + connection.name + ' from ', connection.otherName);
			var conn = users[connection.otherName];

			connection.otherName = null;

			if (conn)
				sendTo(conn, { type: 'leave' });
		}
	}
};
//END CLOSE EVENT

//START SEND EVENT
var sendTo = function (conn, message) {
	conn.send(JSON.stringify(message));
};
//END SEND EVENT