#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NavigationScreenModule, NSObject)
RCT_EXTERN_METHOD(setAwake:(BOOL)enabled
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
