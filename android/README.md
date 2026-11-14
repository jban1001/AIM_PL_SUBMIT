# GAZEE Android 실행 안내

## 빌드 및 실행

Node.js 24와 pnpm, Android Studio, Android SDK 36.1, Pleos Connect 에뮬레이터를 준비합니다. 저장소 루트에서 `pnpm install --frozen-lockfile`을 실행한 뒤 Android Studio에서 `android/`를 열고 Gradle을 동기화합니다. Pleos Connect 에뮬레이터를 선택해 **Run**을 실행하면 React 화면이 APK에 함께 빌드됩니다.

Windows에서는 에뮬레이터를 켠 뒤 저장소 루트에서 다음 명령으로 디버그 APK를 빌드하고 설치할 수 있습니다. 스크립트는 `JAVA_HOME`에 JDK가 설정되어 있지 않으면 Android Studio에 포함된 JDK를 찾습니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\android\build-apk.ps1 -Install
```

빌드만 하려면 `-Install`을 생략합니다. 생성된 APK의 경로는 `android/app/build/outputs/apk/debug/app-debug.apk`입니다.

## 음성 제보

1. 에뮬레이터 **Extended Controls → Microphone**에서 **Enable Host Microphone Access**를 켭니다. 앱에서 처음 마이크를 사용할 때 녹음 권한을 허용합니다.
2. **GLEO**를 호출하고 “가지 앱에 인천대교 진입 지점에서 차가 너무 막혀요. 조금 움직이다가 다시 멈추는 상황이 반복되고 있어요. 제보해줘”라고 말합니다.
3. **앱 마이크**로 제보할 때는 주행 모드의 **음성으로 제보**를 누르고 제보 내용을 말한 뒤 **“제보해줘”**로 끝냅니다. **글 작성 → 말로 입력**에서는 같은 끝맺음으로 받아쓰기를 마치고 **등록**을 눌러 게시합니다.

앱 마이크는 Pleos SpeechToText 3.3.1 `ON_DEVICE` 모드로 한국어(`ko-KR`)를 인식합니다. 여러 문장을 최대 60초 동안 이어서 받을 수 있으며, 시간이 지나면 확보한 문장을 화면에 보관합니다. GLEO 호출은 시스템의 별도 음성 경로를 사용합니다.

GLEO의 호출명은 **가지**입니다. [App Schema](app/src/main/assets/schema.json)의 `GAZEE_CREATE_REPORT`가 제목과 발화 정보를 전달하고, 앱이 등록 결과를 콜백으로 돌려줍니다. 스키마 적용 방식은 [Pleos GLEO 스키마 연동 문서](https://document.pleos.ai/docs/pleos-only/app-integration-guide/guide/deliver-schema)를 참고하세요.

## 등록과 수신 시연

시연 문장으로 제보를 등록하면 체크 아이콘과 **“제보가 등록되었습니다.”**가 표시됩니다. 완료 화면이 닫히면 주행 모드의 앞차 화면에서 등록된 카드를 볼 수 있습니다. GLEO를 통해 등록하면 앱이 카드 제목, 요약이 있는 경우 요약, 완료 문구를 GLEO의 음성 응답으로 돌려줍니다.

뒤차를 시연하려면 Pleos 에뮬레이터 한 대에서 **앞차 상태로 시연 문장에 맞는 제보를 등록**합니다. 같은 앱 세션을 유지한 채 Virtual Console에서 D단 30 km/h 이상을 유지하고, 저장소 루트에서 아래 명령을 실행합니다. 뒤차 전환 약 15초 뒤 수신 카드가 뜨고 알림음이 재생됩니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\android\demo-vehicle.ps1 -Role rear
```

앞차로 돌아갈 때는 `-Role front`로 실행합니다. 다시 수신을 촬영하려면 앞차로 돌아가서 뒤차 전환 명령을 다시 실행합니다.

| 범주 | 시연 발화 또는 글 작성 문장 |
| --- | --- |
| 교통 | 인천대교 진입 지점에서 차가 너무 막혀요. 조금 움직이다가 다시 멈추는 상황이 반복되고 있어요. |
| 도로 위험 | 인하대역 3번 출구쯤 블랙아이스 현상 발생해서 차들이 우회하고 있어요. 조심하세요. |
| 주차 | 주차장 지하 2층에서 충전기를 연결했는데 충전이 시작되지 않네요. |
| 지역 정보 | 인하대학교에 볼일이 있어서 들렀는데 인하IC에서 미추홀 구청으로 가는 길에 괜찮은 국밥집이 있네. |

- **GLEO 읽기**는 “가지 앱에서 방금 받은 도로 제보를 알려줘”로 요청합니다. 앱의 `GAZEE_READ_RECEIVED_REPORT`가 안내 문장을 GLEO에 반환합니다.
- **수신 카드 읽기**는 **제보글 음성 출력** 버튼으로 실행합니다. Pleos TextToSpeech 3.3.1 `ON_DEVICE`를 사용하며, 엔진 오류가 나면 카드에 결과를 표시합니다.

## 주행 모드 확인

Pleos Connect 에뮬레이터 v2.1.0 이상을 실행하고 아래 명령으로 Virtual Console을 연결합니다. 에뮬레이터가 여러 대 연결된 경우 `adb devices`로 대상 시리얼을 확인하고 `adb -s <serial> forward tcp:8088 tcp:8088`을 사용합니다.

```bash
adb forward tcp:8088 tcp:8088
```

브라우저에서 [Virtual Console](http://127.0.0.1:8088/)을 열고 D단으로 변경한 뒤 가속합니다. 속도가 30 km/h 이상이면 GAZEE의 주행 모드가 켜집니다. 감속해 30 km/h 미만이 되거나 P단으로 바꾸면 일반 게시판 화면으로 돌아갑니다.

이 속도 기준은 Pleos 에뮬레이터 디버그 빌드의 시연용입니다. 실제 이용 가능 여부는 플랫폼의 `CarUxRestrictionsManager` 상태에 따릅니다. [Pleos Virtual Console 설정 가이드](https://document.pleos.ai/en/docs/connect/guide/getting-started/application-development/use-vehicle-emulator)

## 음성 동작 점검

| 증상 | 확인할 항목 |
| --- | --- |
| GLEO가 호출에 반응하지 않음 | 호스트 마이크 설정을 확인하고 GLEO에 “지금 몇 시야?”처럼 시스템 명령을 먼저 시험합니다. GLEO가 반응하면 “가지 앱에”를 포함해 요청합니다. |
| 음성은 인식되지만 제보가 등록되지 않음 | 최종 인식 문장이 “제보해줘”로 끝나는지 확인합니다. 글 작성의 받아쓰기는 텍스트를 채우므로 작성 화면에서 **등록**을 누릅니다. |
| 태그는 맞는데 시연 고정 카드가 나오지 않음 | 인식된 장소와 상황이 위 시연 문장과 맞는지 확인합니다. 예를 들어 “인하대역 3번 출구에 블랙아이스가 있어요”가 인식되어야 합니다. 알려진 끝말 오인식은 카드 판정에서 정리됩니다. |
| 뒤차로 전환했는데 수신 카드가 뜨지 않음 | 같은 세션에서 앞차가 가장 최근에 등록한 글이 시연 고정 카드인지 확인합니다. 주행 모드에서 뒤차로 전환하고 약 15초 기다립니다. 처음 실행했다면 관심 범주 선택을 마치고 GAZEE 화면을 열어둡니다. |
| 수신 카드의 음성 출력이 실패함 | 카드에 표시된 Pleos TTS 상태를 확인합니다. `ON_DEVICE_ENGINE_ERROR`가 표시되면 합성 엔진의 실패입니다. 알림음은 시연 제보 수신으로, GLEO 읽기는 음성 요청으로 각각 확인할 수 있습니다. |

이전 에뮬레이터와 빌드에서 진행한 음성 검증은 [TTS 검증 기록](TTS-VERIFICATION.md)에 남아 있습니다.
