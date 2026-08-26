import { ReactElement } from "react"
import { FlatList, ListRenderItemInfo } from "react-native"

type DataListProps<T> = {
  data: T[]
  renderItem: (info: ListRenderItemInfo<T>) => ReactElement
  keyExtractor: (item: T, index: number) => string
}

export const DataList = <T,>({ data, renderItem, keyExtractor }: DataListProps<T>) => (
  <FlatList
    className="flex-1"
    contentContainerClassName="pb-2"
    data={data}
    renderItem={renderItem}
    keyExtractor={keyExtractor}
    alwaysBounceVertical={false}
    showsVerticalScrollIndicator={false}
  />
)
