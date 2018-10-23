import {Component, OnInit, ViewChild} from '@angular/core';
import {VvcInteractionService, Dimension, UiState} from '@vivocha/client-interaction-core';
import {ChatAreaComponent} from '@vivocha/client-interaction-layout';
import {Observable} from 'rxjs';

interface Dimensions {
  [key: string]: Dimension;
}

@Component({
  selector: 'vvc-root',
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {

  @ViewChild(ChatAreaComponent) chat: ChatAreaComponent;

  public messages: Array<any>;

  public appState$: Observable<UiState>;

  public closeModalVisible = false;
  public surveyVisible = false;

  private dimensions: Dimensions = {
    fullscreen: { position: 'fixed', width: '100%', height: '100%', top: '0', right: '0', bottom: '0', left: '0' },
    minimized: {position: 'fixed', width: '80px', height: '80px', right: '0', bottom: '0'},
    minimizedCbn: {
      position: 'fixed',
      width   : window['VVC_VAR_ASSETS']['initialWidth'],
      height  : '45px',
      right   : '40px',
      bottom  : '0px'
      // right   : window['VVC_VAR_ASSETS']['initialRight'],
      // bottom  : window['VVC_VAR_ASSETS']['initialBottom']
    },
    minimizedCbnMobile: {
      position: 'fixed',
      width   : '100%',
      height  : '45px',
      left    : '0',
      right   : '0',
      bottom  : '0'
      // right   : window['VVC_VAR_ASSETS']['initialRight'],
      // bottom  : window['VVC_VAR_ASSETS']['initialBottom']
    },
    normal: {
      position: 'fixed',
      width   : window['VVC_VAR_ASSETS']['initialWidth'],
      height  : window['VVC_VAR_ASSETS']['initialHeight'],
      right   : '40px',
      bottom  : '-10px'
      // right   : window['VVC_VAR_ASSETS']['initialRight'],
      // bottom  : window['VVC_VAR_ASSETS']['initialBottom']
    },
    custom: {position: 'fixed', width: '100%', height: '100%', top: '0', right: '0', bottom: '0', left: '0'}
  };

  constructor(private interactionService: VvcInteractionService) {}
  ngOnInit() {
    this.appState$ = this.interactionService.getState();
    this.interactionService.init().subscribe(context => {
      this.interactionService.setDimensions(context.isMobile ? this.dimensions.fullscreen : this.dimensions.normal);
    });
    // this.interactionService.getState().subscribe( state => console.log(JSON.stringify(state, null, 2)));
  }
  acceptAgentRequest(requestId) {
    this.interactionService.acceptAgentRequest(requestId);
  }
  acceptOffer() {
    this.interactionService.acceptOffer();
  }
  addChatToFullScreen(show) {
    this.interactionService.addChatToFullScreen(show);
  }
  appendText(text) {
    this.chat.appendText(text);
  }
  askForVideoUpgrade() {
    this.interactionService.askForVideoUpgrade();
  }
  askForVoiceUpgrade() {
    this.interactionService.askForVoiceUpgrade();
  }
  closeApp() {
    this.interactionService.closeApp();
  }
  closeCbn() {
    this.interactionService.closeContact();
    this.closeApp();
  }
  closeContact(context) {
    const step = this.getCloseStep(context);
    // console.log('CLOSE CONTACT', step, context.variables, context);

    switch (step) {
      case 'remove-app':
        this.closeApp();
        break;
      case 'show-survey':
        this.surveyVisible = true;
        this.interactionService.showSurvey();
        break;
      case 'close-and-survey':
        this.surveyVisible = true;
        this.interactionService.closeContact();
        this.interactionService.showSurvey();
        break;
      case 'show-close-modal':
        this.closeModalVisible = true;
        this.interactionService.showCloseModal();
        break;
      case 'close-and-stay':
        this.dismissCloseModal();
        this.closeModalVisible = true;
        this.interactionService.closeContact();
        break;
      case 'close-and-remove':
        this.interactionService.closeContact();
        this.closeApp();
        break;
    }
  }
  closeUploadPanel() {
    this.interactionService.closeUploadPanel();
  }
  dismissCloseModal() {
    this.closeModalVisible = false;
    this.interactionService.dismissCloseModal();
  }
  doUpload(upload) {
    this.interactionService.sendAttachment(upload);
  }
  exitFromFullScreen() {
    this.interactionService.setNormalScreen();
  }
  expandWidget(isFullScreen) {
    this.interactionService.maximizeWidget(isFullScreen, isFullScreen ? this.dimensions.fullscreen : this.dimensions.normal);
  }
  getCloseStep(context) {
    if (!context.contactStarted) {
      return 'remove-app';
    }
    if (context.isInQueue) {
      return 'close-and-remove';
    }
    if (context.isClosed) {
      if (context.hasSurvey && context.canRemoveApp) {
        if (this.surveyVisible) {
          return 'remove-app';
        } else {
          return 'show-survey';
        }
      } else {
        return 'remove-app';
      }
    } else {
      if (context.variables.askCloseConfirm) {
        if (this.closeModalVisible) {
          if (context.variables.stayInAppAfterClose) {
            return 'close-and-stay';
          } else {
            if (context.hasSurvey) {
              if (this.surveyVisible) {
                return 'remove-app';
              } else {
                return 'close-and-survey';
              }
            } else {
              return 'close-and-remove';
            }
          }
        } else {
          return 'show-close-modal';
        }
      } else {
        if (context.variables.stayInAppAfterClose) {
          return 'close-and-stay';
        } else {
          if (context.hasSurvey) {
            if (this.surveyVisible) {
              return 'remove-app';
            } else {
              return 'close-and-survey';
            }
          } else {
            return 'close-and-remove';
          }
        }
      }
    }
  }
  hangUpCall() {
    this.interactionService.hangUp(this.dimensions.normal);
  }
  hasToStayInApp(context) {
    return (context.isClosed && context.variables.stayInAppAfterClose);
  }
  hideChat() {
    this.interactionService.hideChat();
  }
  maximizeCbn(isMobile: boolean, notRead: boolean) {
    this.interactionService.maximizeWidget(false, isMobile ? this.dimensions.fullscreen : this.dimensions.normal);
    if (notRead) {
      this.upgradeCbnToChat();
    }
  }
  minimizeCbn(isMobile: boolean) {
    this.interactionService.minimizeWidget(isMobile ? this.dimensions.minimizedCbnMobile : this.dimensions.minimizedCbn);
  }
  minimizeWidget() {
    this.interactionService.minimizeWidget(this.dimensions.minimized);
  }
  minimizeMedia() {
    this.interactionService.minimizeMedia();
  }
  muteToggle(muted) {
    this.interactionService.muteToggle(muted);
  }
  openAttachment(url: string, click?: boolean) {
    this.interactionService.openAttachment(url, click);
  }
  processAction(action) {
    this.interactionService.sendPostBack(action);
  }
  processQuickReply(reply) {
    this.interactionService.processQuickReply(reply);
  }
  rejectAgentRequest(requestId) {
    this.interactionService.rejectAgentRequest(requestId);
  }
  rejectOffer() {
    this.interactionService.rejectOffer();
  }
  sendIsWriting() {
    this.interactionService.sendIsWriting();
  }
  sendText(value, isEmojiPanelVisible) {
    if (isEmojiPanelVisible) {
      this.toggleEmojiPanel();
    }
    this.interactionService.sendText(value);
  }
  setFullScreen() {
    this.expandWidget(true);
  }
  showCloseDialog(context) {
    return (context && !context.isCLosed && context.variables && context.variables.askCloseConfirm && !this.closeModalVisible);
  }
  showCloseModal(closeOpt) {
    if (closeOpt.forceClose) {
      this.interactionService.closeContact();
      if (!closeOpt.stayInAppAfterClose && !closeOpt.hasSurvey) {
        this.closeApp();
      } else if (closeOpt.hasSurvey && !closeOpt.stayInAppAfterClose) {
        this.showSurvey();
      }
    } else {
      this.interactionService.showCloseModal();
    }
  }
  showUploadPanel() {
    this.interactionService.showUploadPanel();
  }
  showSurvey() {
    this.interactionService.showSurvey();
  }
  submitDataCollection(dc) {
    this.interactionService.submitDataCollection(dc);
  }
  toggleEmojiPanel() {
    this.interactionService.toggleEmojiPanel();
  }
  updateLeftScrollOffset(scrollObject: { scrollLeft: number, messageId: string}) {
    this.interactionService.updateLeftScrollOffset(scrollObject);
  }
  upgradeCbnToChat() {
    this.interactionService.upgradeCbnToChat();
  }
  videoToggle(show) {
    this.interactionService.toggleVideo(show);
  }
}
