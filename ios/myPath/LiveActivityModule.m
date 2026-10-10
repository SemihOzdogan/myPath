#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiveActivityModule, NSObject)
RCT_EXTERN_METHOD(start:(NSString *)destination
                  instruction:(NSString *)instruction
                  traveledDistance:(NSString *)traveledDistance
                  remainingDistance:(NSString *)remainingDistance
                  remainingTime:(NSString *)remainingTime
                  eta:(NSString *)eta
                  progress:(nonnull NSNumber *)progress
                  isWalking:(BOOL)isWalking
				  hasArrived:(BOOL)hasArrived
				  routeCoordinates:(NSArray *)routeCoordinates
				  routeLengthMeters:(nonnull NSNumber *)routeLengthMeters
				  durationSeconds:(nonnull NSNumber *)durationSeconds
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(update:(NSString *)instruction
                  traveledDistance:(NSString *)traveledDistance
                  remainingDistance:(NSString *)remainingDistance
                  remainingTime:(NSString *)remainingTime
                  eta:(NSString *)eta
                  progress:(nonnull NSNumber *)progress
                  isWalking:(BOOL)isWalking
				  hasArrived:(BOOL)hasArrived
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(end:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
