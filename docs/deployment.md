# Установка и публикация Veirune Mobile

Приложение называется **Veirune**. Идентификаторы пакетов, домен и ключи подписи сохраняются для совместимости. Репозитории переименованы в `veirune`, `veirune-backend`, `veirune-mobile` и `veirune-website`; локальные папки пока сохраняют прежние имена.

Подготовлены мобильный клиент **0.1.3**, помощь со входом с ПК в desktop **0.4.16** и серверные изменения. Десктопные изменения подготовлены поверх исходников **0.4.14**; существующие теги и опубликованные манифесты не изменены. Ничего не отправлено на GitHub и сервер автоматически.

## 1. Обновить сервер

В PowerShell на ПК:

```powershell
cd D:\projects\fastcloud-backend
git add .
git commit -m "feat: mobile lyrics, imports, phone pairing and Android updates"
git push origin main
ssh fastcloud "cd ~/fastcloud-backend && git pull --ff-only && bash deploy_checked.sh -f compose.ip.yaml -f compose.vpn.yaml"
```

Дождись `Backend health verified`. Скрипт выполняет проверку базы и резервное копирование. При первой сборке образа дополнительно компилируется Rust-поиск текстов.

Сервер по умолчанию смотрит публичные релизы `COMF2222/veirune-mobile`. Новый секрет для мобильного клиента не нужен. До первого релиза обновления отсутствуют — это нормальное состояние. Метаданные кэшируются на 2 минуты; клиент проверяет при запуске, возвращении в приложение и раз в 30 минут, а также вручную в настройках.

## 2. Выпустить помощь со входом на телефоне

```powershell
cd D:\projects\fastcloud
git add .
git commit -m "feat: Veirune branding, selectable icons and mobile pairing; release 0.4.16"
git push origin main
```

Дождись зелёного CI main, включая оба Mac. Затем:

```powershell
cd D:\projects\fastcloud
git tag -a v0.4.16 -m "Veirune v0.4.16"
git push origin v0.4.16
```

Дождись успешного релиза GitHub и обнови клиент на ПК до 0.4.16.

## 3. Установить APK на Honor

Файл для установки: `D:\projects\fastcloud-mobile\release\Veirune-Mobile-0.1.3.apk`.
Перенеси его на телефон и открой. Разреши установку из файлового приложения, если Android попросит. В Veirune выбери **Подключить с ПК**; код с телефона введи в **Настройки → Аккаунт → Подключить телефон** на ПК и подтверди тот же SoundCloud-аккаунт в браузере. Код действует 10 минут. Телефон получает отдельную сессию; вход на ПК сохраняется.

Проверь музыку с выключенным VPN телефона, экран блокировки, переходы и синхронизацию по [списку проверок](verification.md). Эти проверки требуют настоящего устройства и ещё не выполнены на Honor.

## 4. Отправить исходники мобильного клиента

```powershell
cd D:\projects\fastcloud-mobile
git add .
git commit -m "feat: Veirune Android client, icon selection and shared iOS foundation"
git push -u origin main
```

Remote уже настроен на `https://github.com/COMF2222/veirune-mobile.git`. Репозиторий должен быть публичным для скачивания APK сервером. CI проверяет Android и собирает iOS на Mac; тестовый APK из checks.yml подписан отладочным ключом и не предназначен для обновления установленного релизного APK.

## 5. Один раз настроить подпись GitHub

Постоянный ключ уже создан локально: `%LOCALAPPDATA%\Fastcloud\mobile-signing\fastcloud-mobile-release.p12`. Пароль зашифрован Windows DPAPI в `signing.json` рядом с ним. Ключ не находится в репозитории. Сохрани резервную копию ключа и пароля в защищённом хранилище: копия одного `signing.json` на другой ПК не расшифруется. При потере ключа обновление поверх установленного приложения станет невозможно.

Если GitHub CLI ещё нет:

```powershell
winget install --id GitHub.cli --source winget
```

Открой новый PowerShell:

```powershell
gh auth login
cd D:\projects\fastcloud-mobile
powershell -NoProfile -File tools/configure-github-signing.ps1
```

Последняя команда отправит четыре секрета подписи только в `COMF2222/veirune-mobile`: `FASTCLOUD_ANDROID_KEYSTORE_BASE64`, `FASTCLOUD_ANDROID_STORE_PASSWORD`, `FASTCLOUD_ANDROID_KEY_ALIAS`, `FASTCLOUD_ANDROID_KEY_PASSWORD`. Скрипт не выводит значения. Это делает владелец; автоматически секреты не передавались.

## 6. Опубликовать Android 0.1.3 после проверки телефона

```powershell
cd D:\projects\fastcloud-mobile
git tag -a v0.1.3 -m "Veirune Mobile v0.1.3"
git push origin v0.1.3
```

Workflow release.yml собирает APK тем же ключом, проверяет его пакет/версию/подпись, публикует APK, `latest-android.json` и RU/EN изменения. Следующие версии появятся внутри приложения. При установке Android попросит разрешение и подтверждение; данные сохраняются при установке поверх приложения.

## Следующее мобильное обновление

Замени номер и описания изменений на реальные:

```powershell
cd D:\projects\fastcloud-mobile
python tools/bump-version.py 0.1.5 --ru "Описание изменения" --en "Description of the change"
npm run apk
python tools/stage-android-release.py
git add .
git commit -m "fix: mobile improvements; release 0.1.5"
git push origin main
git tag -a v0.1.5 -m "Veirune Mobile v0.1.5"
git push origin v0.1.5
```

`bump-version.py` обновляет package/lock, iOS версию/номер сборки и отдельные мобильные RU/EN заметки. Android берёт версию из package.json. Десктопный latest.json не используется мобильным клиентом.

## iPhone

На Windows не собрана и не проверена IPA. Нужны Mac, Xcode 26 и Apple-подпись. CI проверит компиляцию симулятора после отправки исходников. Для публичных обновлений iOS нужен App Store; после публикации серверу задаётся `FASTCLOUD_IOS_STORE_URL` с официальной ссылкой приложения. До этого UI не предлагает установить APK на iPhone. EQ/нормализация на iOS скрыты до реализации нативной поддержки.

## 7. Обновить сайт

После успешного релиза десктопа:

```powershell
cd D:\projects\fastcloud-website
npm run build
git add .
git commit -m "feat: Veirune branding and Android download section"
git push origin main
```

Если Cloudflare уже подключён к этому репозиторию, дождись его автоматического деплоя.
При ручной публикации вместо ожидания выполни в этой же папке:

```powershell
npx wrangler deploy
```

Имя Worker и текущий домен оставлены прежними. Нужна твоя существующая авторизация
Cloudflare. Вручную менять адреса загрузок на сайте не нужно: Windows/Mac берутся
из опубликованных десктопных релизов, Android — из отдельного мобильного релиза.
До публикации APK кнопка Android явно сообщает, что выпуск готовится.

## Значки

По умолчанию выбран №9 «Луна», в настройках доступны все 12 вариантов.
Выбор относится к устройству и не синхронизируется с другими устройствами.
Android переключает ярлык лаунчера. Windows меняет окно, трей и существующие
ярлыки, которые указывают на этот установленный exe; при явном выборе создаётся
ярлык Veirune на рабочем столе, если его ещё нет. Перезапуск Explorer не требуется.
macOS меняет Dock и запрашивает смену значка Finder через системный API;
если пакет приложения недоступен для записи, клиент сообщает об ограничении Finder.
iOS использует системные альтернативные значки. Лаунчер может обновить картинку
с задержкой. Фактическую смену на Honor, Mac и iPhone надо подтвердить на устройстве.

Перед созданием тегов дождись зелёных проверок main: десктоп проверяется также
на обоих Mac, мобильный проект — компиляцией симулятора iOS. Фоновая музыка,
клавиатура телефона и установка поверх предыдущего APK проверяются отдельно
по docs/verification.md. Здесь нет автоматически выполненного пуша или деплоя.


При желании обновить публичное описание GitHub, сохранив рабочие адреса репозиториев:

```powershell
gh repo edit COMF2222/veirune --description "Veirune — SoundCloud player for Windows and macOS: lyrics, themes, recommendations" --homepage "https://fastcloud.comf.workers.dev/"
gh repo edit COMF2222/veirune-mobile --description "Veirune Mobile — Android player with a shared iOS foundation" --homepage "https://fastcloud.comf.workers.dev/#mobile"
```

Проверка релиза принимает форматы apksigner 36 и 37 и сверяет сертификат с
`android/release-certificate.sha256`. Это публичный отпечаток, а не секрет.
Не создавай новый ключ для исправления CI: иначе обновления установленного APK не заработают.
