const socket = io(); // io function은 알아서 socket.io를 실행하고 있는 서버를 찾을 것이다!

const myVoice = document.getElementById("myVoice");
const muteBtn = document.getElementById("mute");
const micBtn = document.getElementById("mic");
const micsSelect = document.getElementById("mics");


const call = document.getElementById("call");

call.hidden = true;


// stream받기 : stream은 비디오와 오디오가 결합된 것
let myStream;
let muted = false; // 처음에는 음성을 받음
let roomName;
let myPeerConnection; // 누군가 getMedia함수를 불렀을 때와 똑같이 stream을 공유하기 위한 변수
let myDataChannel;

async function getmics(){
    try {
        const devices = await navigator.mediaDevices.enumerateDevices(); // 장치 리스트 가져오기
        const mics = devices.filter(device => device.kind === "audioinput"); // 비디오인풋만 가져오기
        const currentmic = myStream.getAudioTracks()[0]; // 비디오 트랙의 첫 번째 track 가져오기 : 이게 mics에 있는 label과 같다면 그 label은 선택된 것이다!

        mics.forEach(mic => {
            const option = document.createElement("option"); // 새로운 옵션 생성
            option.value = mic.deviceId; // 카메라의 고유 값을 value에 넣기
            option.innerText = mic.label; // 사용자가 선택할 때는 label을 보고 선택할 수 있게 만들기
            if(currentmic.label === mic.label) { // 현재 선택된 카메라 체크하기
                option.selected = true;
            }
            micsSelect.appendChild(option); // 카메라의 정보들을 option항목에 넣어주기
        })
    } catch (e) {
        console.log(e);
    }
}

// https://developer.mozilla.org/ko/docs/Web/API/MediaDevices/getUserMedia 사용 : 유저의 유저미디어 string을 받기위함
async function getMedia(deviceId){
    const initialConstraints = { // initialConstraints는 deviceId가 없을 때 실행
        audio: true,
    };
    const micConstraints = { // micConstraints는 deviceId가 있을 때 실행
        audio: true,
    };

    try {
        myStream = await navigator.mediaDevices.getUserMedia(
            deviceId ? micConstraints : initialConstraints
        )
        myVoice.srcObject = myStream;
        if (!deviceId) { // 처음 딱 1번만 실행! 우리가 맨 처음 getMedia를 할 때만 실행됨!!
            await getmics();
        }
    } catch (e) {
        console.log(e);
    }
}

function handleMuteClick() {
    myStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
    if(!muted) {
        muteBtn.innerText = "Unmute";
        muted = true;
    }
    else {
        muteBtn.innerText = "Mute";
        muted = false;
    }
}

async function handlemicChange() {
    await getMedia(micsSelect.value); // audio device의 새로운 id로 또 다른 stream을 생성
    if(myPeerConnection){
        const audioTrack = myStream.getAudioTracks()[0];
        const audioSender = myPeerConnection
            .getSenders()
            .find(sender => sender.track.kind === "audio");
        audioSender.replaceTrack(audioTrack);
    }
}

muteBtn.addEventListener("click", handleMuteClick);

const welcome = document.getElementById("welcome");
const welcomeForm = welcome.querySelector("form");

async function initCall(){
    welcome.hidden = true;
    call.hidden = false;
    await getMedia();
    makeConnection();
}

async function handleWelcomeSubmit(event){
    event.preventDefault();
    const input = welcomeForm.querySelector("input");
    await initCall();
    socket.emit("join_room", input.value, ); // 서버로 input value를 보내는 과정!! initCall 함수도 같이 보내준다!
    roomName = input.value; // 방에 참가했을 때 나중에 쓸 수 있도록 방 이름을 변수에 저장
    input.value = "";
}

welcomeForm.addEventListener("submit", handleWelcomeSubmit);
// Socket Code

socket.on("welcome", async () => {
    myDataChannel = myPeerConnection.createDataChannel("chat"); // offer를 만드는 peer가 DataChannel을 만드는 주체
    myDataChannel.addEventListener("message", event => console.log(event.data)); // 메세지를 받는 곳
    console.log("made data channel");
    const offer = await myPeerConnection.createOffer(); // 다른 사용자를 초대하기 위한 초대장!! (내가 누구인지를 알려주는 내용이 들어있음!)
    myPeerConnection.setLocalDescription(offer); // myPeerConnection에 내 초대장의 위치 정보를 연결해 주는 과정 https://developer.mozilla.org/ko/docs/Web/API/RTCPeerConnection/setLocalDescription
    console.log("sent the offer");
    socket.emit("offer", offer, roomName);
})

socket.on("offer", async (offer) => {
    myPeerConnection.addEventListener("datachannel", event => { // offer를 받는 쪽에서는 새로운 DataChannel이 있을 때 eventListener를 추가한다
        myDataChannel = event.channel;
        myDataChannel.addEventListener("message", event => console.log(event.data)); // 메세지를 받는 곳
    });
    console.log("received the offer");
    myPeerConnection.setRemoteDescription(offer); // 다른 브라우저의 위치를 myPeerConnection에 연결해 주는 과정
    const answer = await myPeerConnection.createAnswer();
    myPeerConnection.setLocalDescription(answer); // 현재 브라우저에서 생성한 answer를 현재 브라우저의 myPeerConnection의 LocalDescription으로 등록!!
    socket.emit("answer", answer, roomName);
    console.log("sent the answer");
})

socket.on("answer", answer => {
    console.log("received the answer");
    myPeerConnection.setRemoteDescription(answer);
});

socket.on("ice", ice => {
    console.log("received candidate");
    myPeerConnection.addIceCandidate(ice);
})

// RTC code
function makeConnection() {
    myPeerConnection = new RTCPeerConnection({ // 구글의 STUN 서버를 빌려서 사용!!
        iceServers: [
            {
                urls: [
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302",
                    "stun:stun2.l.google.com:19302",
                    "stun:stun3.l.google.com:19302",
                    "stun:stun4.l.google.com:19302",
                ]
            },
        ],
    }); // peerConnection을 각각의 브라우저에 생성 https://developer.mozilla.org/ko/docs/Web/API/RTCPeerConnection 참조
    myPeerConnection.addEventListener("icecandidate", handleIce);
    myPeerConnection.addEventListener("addstream", handleAddStream);
    myStream.getTracks().forEach(track => myPeerConnection.addTrack(track, myStream)); // 영상과 음성 트랙을 myPeerConnection에 추가해줌 -> Peer-to-Peer 연결!!
}

function handleIce(data){
    console.log("sent candidate");
    socket.emit("ice", data.candidate, roomName);
}

function handleAddStream(data){
    const peersVoice = document.getElementById("peersVoice");
    peersVoice.srcObject = data.stream;
}